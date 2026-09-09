// SPDX-License-Identifier: MIT
import type { CompetitionStartIssue } from '@/main/shared-infra/operations/CompetitionStartReadiness';
import { ClockProbeAcknowledgementDataSchema, type HardwareStatePayload } from '@/shared/mqtt';

import {
  ClockQualityPolicy,
  type ClockQualityAssessment,
  type IClockQualityPolicy,
} from '../domain/ClockQualityPolicy';
import { LaneTimingEvidencePolicy } from '../domain/LaneTimingEvidencePolicy';
import { TimedTargetReadinessPolicy, type ITimedTargetReadinessPolicy } from '../domain/TimedTargetReadinessPolicy';

import type { CommandExecutionResult, LaneClockProbeResult } from './DirectorMqttTypes';

interface LaneReadinessSource {
  isReady(): boolean;
  getHardware(laneId: string): HardwareStatePayload | null | undefined;
}

/** Evaluates live Lane capabilities and owns broker-scoped clock approvals. */
export class DirectorLaneReadiness {
  private clockQualityByLaneId = new Map<string, ClockQualityAssessment>();
  private timingEvidencePolicy = new LaneTimingEvidencePolicy();

  constructor(
    private readonly source: LaneReadinessSource,
    private clockQualityPolicy: IClockQualityPolicy = new ClockQualityPolicy(),
    private timedTargetReadinessPolicy: ITimedTargetReadinessPolicy = new TimedTargetReadinessPolicy(),
  ) {}

  /** New tolerances require fresh probes, so cached approvals cannot survive a policy change. */
  setClockQualityPolicy(policy: IClockQualityPolicy): void {
    this.clockQualityPolicy = policy;
    this.clockQualityByLaneId.clear();
  }

  setTimedTargetReadinessPolicy(policy: ITimedTargetReadinessPolicy): void {
    this.timedTargetReadinessPolicy = policy;
  }

  setTimingEvidencePolicy(policy: LaneTimingEvidencePolicy): void {
    this.timingEvidencePolicy = policy;
  }

  getTimingEvidenceStartIssues(laneIds: readonly string[]): CompetitionStartIssue[] {
    return laneIds.flatMap((laneId) => {
      const hardware = this.source.getHardware(laneId);
      return this.timingEvidencePolicy.assess(laneId, {
        connected: this.source.isReady() && hardware?.connection.status === 'connected',
        reportedAt: hardware?.publishedAt,
        connection: hardware?.connection,
        evidence: hardware?.capabilities?.timingEvidence,
        settings: hardware?.capabilities?.timedTargetPolicy?.shotTiming,
      });
    });
  }

  getTimedTargetStartIssues(laneIds: readonly string[]): CompetitionStartIssue[] {
    return laneIds.flatMap((laneId) => {
      const hardware = this.source.getHardware(laneId);
      const policy = hardware?.capabilities?.timedTargetPolicy;
      const physical = hardware?.capabilities?.targetIntegration?.timedTarget;
      return this.timedTargetReadinessPolicy.assess(laneId, {
        connected: this.source.isReady() && hardware?.connection.status === 'connected',
        reportedAt: hardware?.publishedAt,
        enforcementMode: policy?.enforcementMode,
        shotTiming: policy?.shotTiming,
        physicalActuation: physical?.actuation,
        physicalFeedback: physical?.feedback,
      });
    });
  }

  assertTimedTargetReadiness(laneIds: readonly string[]): void {
    const issues = this.getTimedTargetStartIssues(laneIds).filter((issue) => issue.blocking);
    if (issues.length) throw new Error(`Timed target readiness: ${issues.map((issue) => issue.message).join('; ')}`);
  }

  getClockQuality(laneId?: string): Readonly<Record<string, ClockQualityAssessment>> | ClockQualityAssessment | null {
    const current = (assessment: ClockQualityAssessment): ClockQualityAssessment => ({
      ...assessment,
      usableForTimedCommands: this.clockQualityPolicy.isUsable(assessment),
    });
    if (laneId !== undefined) {
      const assessment = this.clockQualityByLaneId.get(laneId);
      return assessment ? current(assessment) : null;
    }
    return Object.fromEntries([...this.clockQualityByLaneId].map(([id, assessment]) => [id, current(assessment)]));
  }

  getClockStartIssues(laneIds: readonly string[]): CompetitionStartIssue[] {
    const mode = this.clockQualityPolicy.mode;
    if (mode === 'DISABLED') return [];
    const now = new Date();
    return laneIds.flatMap((laneId) => {
      const assessment = this.clockQualityByLaneId.get(laneId);
      const age = assessment ? now.getTime() - Date.parse(assessment.sampledAt) : NaN;
      const healthy =
        assessment &&
        (mode === 'REQUIRED'
          ? this.clockQualityPolicy.isUsable(assessment, now)
          : assessment.status === 'GOOD' && age >= 0 && age <= assessment.maxSampleAgeMilliseconds);
      return healthy
        ? []
        : [
            {
              code: 'CLOCK_QUALITY',
              message: `Probe Lane ${laneId}: a fresh GOOD clock-quality sample is missing.`,
              blocking: mode === 'REQUIRED',
            },
          ];
    });
  }

  assertTimedCommandReadiness(laneIds: readonly string[]): void {
    const evidenceIssues = this.getTimingEvidenceStartIssues(laneIds).filter((issue) => issue.blocking);
    if (evidenceIssues.length)
      throw new Error(`Timing evidence: ${evidenceIssues.map((issue) => issue.message).join('; ')}`);
    this.assertClockQualityForTimedCommands(laneIds);
  }

  private assertClockQualityForTimedCommands(laneIds: readonly string[]): void {
    const issues = this.getClockStartIssues(laneIds).filter((issue) => issue.blocking);
    if (issues.length > 0) {
      throw new Error(
        `Fresh GOOD clock-quality samples are required before timed commands; ${issues.map((issue) => issue.message).join('; ')}`,
      );
    }
  }

  recordClockProbe(
    laneId: string,
    directorSentAt: Date,
    result: CommandExecutionResult,
    directorReceivedAt = new Date(),
  ): LaneClockProbeResult {
    const laneResult = result.lanes[0];
    const parsed = ClockProbeAcknowledgementDataSchema.safeParse(laneResult?.data);
    const assessment =
      laneResult?.status === 'done' && parsed.success && parsed.data.directorSentAt === directorSentAt.toISOString()
        ? this.clockQualityPolicy.assess(
            {
              directorSentAtMs: directorSentAt.getTime(),
              laneReceivedAtMs: Date.parse(parsed.data.laneReceivedAt),
              laneSentAtMs: Date.parse(parsed.data.laneSentAt),
              directorReceivedAtMs: directorReceivedAt.getTime(),
            },
            directorReceivedAt,
          )
        : this.clockQualityPolicy.unavailable(
            directorReceivedAt,
            laneResult?.status === 'timeout'
              ? 'The Lane clock probe timed out.'
              : 'The Lane returned no valid clock-probe timestamps.',
          );
    this.clockQualityByLaneId.set(laneId, assessment);
    return { command: result, assessment };
  }

  reset(): void {
    this.clockQualityByLaneId.clear();
  }
}
