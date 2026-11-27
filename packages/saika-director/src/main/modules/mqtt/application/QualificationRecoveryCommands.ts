// SPDX-License-Identifier: MIT
import {
  ApplyQualificationRecoveryCommandSchema,
  CancelQualificationRecoveryCommandSchema,
  SettleQualificationRecoveryCommandSchema,
  StartQualificationRecoveryCommandSchema,
} from '@sasakiuri/saika-protocol/commands';

import type { CompetitionStateRegistry } from './CompetitionStateRegistry';
import type { DirectorCommandPort } from './DirectorCommandPort';
import type {
  ApplyQualificationRecoveryInput,
  CancelQualificationRecoveryInput,
  CommandExecutionResult,
  SettleQualificationRecoveryInput,
  StartQualificationRecoveryInput,
} from './DirectorMqttTypes';
import { isTimedTargetSequenceActive } from './TimedTargetCommands';

export type QualificationRecoveryContext = Pick<
  CompetitionStateRegistry,
  | 'requireCompetition'
  | 'requireCompetitionPhase'
  | 'requireCompetitionLane'
  | 'getLane'
  | 'assertSafetyCleared'
  | 'assertTimedCommandReadiness'
  | 'assertTimedTargetReadiness'
>;

/** Executes recovery commands inside the coordinator's competition operation queue. */
export class QualificationRecoveryCommands {
  constructor(
    private readonly commands: DirectorCommandPort,
    private readonly context: QualificationRecoveryContext,
    private readonly startDelayMs: number,
  ) {}

  async startQualificationRecovery(input: StartQualificationRecoveryInput): Promise<CommandExecutionResult> {
    this.context.requireCompetitionPhase(input.competitionId, 'MATCH', 'start a Qualification recovery');
    this.context.requireCompetitionLane(input.competitionId, input.laneId);
    this.context.assertSafetyCleared([input.laneId], 'start a Qualification recovery');
    this.context.assertTimedCommandReadiness([input.laneId]);
    this.context.assertTimedTargetReadiness([input.laneId]);

    const lane = this.context.getLane(input.laneId);
    const laneState = lane?.competitionState;
    if (!laneState || laneState.competitionId !== input.competitionId) {
      throw new Error(`Lane ${input.laneId} has no current state for competition ${input.competitionId}`);
    }
    if (laneState.phase !== 'MATCH' && laneState.phase !== 'SERIES_COMPLETE') {
      throw new Error(`Qualification recovery cannot start from Lane phase ${laneState.phase}`);
    }
    if (laneState.currentStage.index !== input.stageIndex || laneState.currentSeries.index !== input.seriesIndex) {
      throw new Error(
        `Recovery context ${input.stageIndex}:${input.seriesIndex} does not match Lane ${laneState.currentStage.index}:${laneState.currentSeries.index}`,
      );
    }
    if (laneState.currentSeries.maxShots !== input.expectedSeriesShotLimit) {
      throw new Error(
        `Recovery shot limit ${input.expectedSeriesShotLimit} does not match Lane ${laneState.currentSeries.maxShots}`,
      );
    }
    if (laneState.currentSeries.shotsRecorded !== input.expectedRecordedShots) {
      throw new Error(
        `Recovery recorded-shot count ${input.expectedRecordedShots} does not match Lane ${laneState.currentSeries.shotsRecorded}`,
      );
    }
    if (!laneState.interruption || laneState.interruption.interruptionId !== input.interruptionId) {
      throw new Error(`Lane ${input.laneId} is not paused for interruption ${input.interruptionId}`);
    }
    if (laneState.interruption.status !== 'PAUSED') {
      throw new Error(
        `Qualification recovery requires a PAUSED interruption; current status is ${laneState.interruption.status}`,
      );
    }

    const recoveryState = lane?.qualificationRecoveryState;
    if (recoveryState?.status === 'RUNNING' && recoveryState.runId !== input.runId) {
      throw new Error(`Qualification recovery run ${recoveryState.runId} is already active on Lane ${input.laneId}`);
    }
    const timedState = lane?.timedTargetState;
    const retriesCurrentRun =
      timedState?.executionContext?.owner === 'qualification-recovery' &&
      timedState.executionContext.referenceId === input.runId;
    if (isTimedTargetSequenceActive(timedState) && !retriesCurrentRun) {
      throw new Error(`A timed target sequence is already active on Lane ${input.laneId}`);
    }

    const decidedAtMs = Date.parse(input.decidedAt);
    if (!Number.isFinite(decidedAtMs)) throw new Error('Qualification recovery decision time is invalid');
    const originalLoadAt =
      recoveryState?.runId === input.runId ? recoveryState.loadAt : retriesCurrentRun ? timedState.loadAt : undefined;
    const loadAt =
      originalLoadAt ??
      new Date(
        Math.max(
          Date.now() + this.startDelayMs,
          decidedAtMs,
          timedState ? Date.parse(timedState.nextLoadAllowedAt) : Number.NEGATIVE_INFINITY,
        ),
      ).toISOString();
    const command = StartQualificationRecoveryCommandSchema.parse(
      this.commands.commandBase({
        runId: input.runId,
        decisionId: input.decisionId,
        interruptionId: input.interruptionId,
        stageIndex: input.stageIndex,
        seriesIndex: input.seriesIndex,
        expectedMatchProgramId: input.expectedMatchProgramId,
        expectedSeriesShotLimit: input.expectedSeriesShotLimit,
        expectedRecordedShots: input.expectedRecordedShots,
        authorization: input.authorization,
        loadAt,
        officialName: input.officialName,
        decisionRuleReference: input.decisionRuleReference,
        decidedAt: input.decidedAt,
        issuedBy: input.officialName,
      }),
    );
    return this.commands.publishCompetitionLaneCommand(
      input.competitionId,
      input.laneId,
      'start-qualification-recovery',
      command,
    );
  }

  async cancelQualificationRecovery(input: CancelQualificationRecoveryInput): Promise<CommandExecutionResult> {
    this.context.requireCompetition(input.competitionId);
    this.context.requireCompetitionLane(input.competitionId, input.laneId);
    const active = this.context.getLane(input.laneId)?.qualificationRecoveryState;
    if (active?.status === 'RUNNING' && active.runId !== input.runId) {
      throw new Error(`Qualification recovery run ${active.runId} is active instead of ${input.runId}`);
    }
    const command = CancelQualificationRecoveryCommandSchema.parse(
      this.commands.commandBase({ runId: input.runId, reason: input.reason }),
    );
    return this.commands.publishCompetitionLaneCommand(
      input.competitionId,
      input.laneId,
      'cancel-qualification-recovery',
      command,
    );
  }

  async applyQualificationRecovery(input: ApplyQualificationRecoveryInput): Promise<CommandExecutionResult> {
    this.context.requireCompetition(input.competitionId);
    this.context.requireCompetitionLane(input.competitionId, input.laneId);
    const recovery = this.context.getLane(input.laneId)?.qualificationRecoveryState;
    if (!recovery || recovery.runId !== input.runId) {
      throw new Error(`Qualification recovery run ${input.runId} is not current on Lane ${input.laneId}`);
    }
    if (recovery.status !== 'COMPLETED') {
      throw new Error(`Qualification recovery run ${input.runId} is not completed on Lane ${input.laneId}`);
    }
    if (recovery.authorization.phase !== 'SERIES_RECOVERY') {
      throw new Error('Extra sighting shots can never be applied to the MATCH score');
    }
    const command = ApplyQualificationRecoveryCommandSchema.parse(
      this.commands.commandBase({
        runId: input.runId,
        appliedBy: input.appliedBy,
        statement: input.statement,
        appliedAt: input.appliedAt,
        issuedBy: input.appliedBy,
      }),
    );
    return this.commands.publishCompetitionLaneCommand(
      input.competitionId,
      input.laneId,
      'apply-qualification-recovery',
      command,
    );
  }

  async settleQualificationRecovery(input: SettleQualificationRecoveryInput): Promise<CommandExecutionResult> {
    this.context.requireCompetition(input.competitionId);
    this.context.requireCompetitionLane(input.competitionId, input.laneId);
    const recovery = this.context.getLane(input.laneId)?.qualificationRecoveryState;
    if (recovery?.status === 'RUNNING') {
      throw new Error(`Qualification recovery run ${recovery.runId} is still running on Lane ${input.laneId}`);
    }
    const command = SettleQualificationRecoveryCommandSchema.parse(
      this.commands.commandBase({
        decisionId: input.decisionId,
        interruptionId: input.interruptionId,
        stageIndex: input.stageIndex,
        seriesIndex: input.seriesIndex,
        expectedMatchProgramId: input.expectedMatchProgramId,
        expectedSeriesShotLimit: input.expectedSeriesShotLimit,
        expectedRecordedShots: input.expectedRecordedShots,
        treatment: input.treatment,
        decisionOfficialName: input.decisionOfficialName,
        decisionRuleReference: input.decisionRuleReference,
        decidedAt: input.decidedAt,
        appliedBy: input.appliedBy,
        statement: input.statement,
        appliedAt: input.appliedAt,
        issuedBy: input.appliedBy,
      }),
    );
    return this.commands.publishCompetitionLaneCommand(
      input.competitionId,
      input.laneId,
      'settle-qualification-recovery',
      command,
    );
  }
}
