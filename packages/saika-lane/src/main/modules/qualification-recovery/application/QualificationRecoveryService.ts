// SPDX-License-Identifier: MIT
import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import type { ICompetitionInterruptionControl } from '@/main/modules/competition-interruption';
import type { ITimedTargetControl, TimedTargetState } from '@/main/modules/timed-target';
import type { ShotRecordedEvent, TimedTargetSequenceChangedEvent } from '@/main/shared-infra/events/coreEvents';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';

import type { IQualificationRecoveryControl } from '../domain/IQualificationRecoveryControl';
import type { IQualificationRecoveryRepository } from '../domain/IQualificationRecoveryRepository';
import { buildQualificationRecoveryProgram } from '../domain/QualificationRecoveryProgram';
import {
  createQualificationRecoveryRunStart,
  QUALIFICATION_RECOVERY_ACQUISITION_OWNER,
  qualificationRecoveryRequestMatches,
  type QualificationRecoveryRunRecord,
  type StartQualificationRecoveryRunInput,
} from '../domain/QualificationRecoveryRun';

/** Executes an official decision while leaving recommendation and scoring to other boundaries. */
export class QualificationRecoveryService implements IQualificationRecoveryControl {
  constructor(
    private readonly repository: IQualificationRecoveryRepository,
    private readonly competitionRepository: ICompetitionRepository,
    private readonly interruptionControl: Pick<ICompetitionInterruptionControl, 'get'>,
    private readonly timedTargetControl: ITimedTargetControl,
    private readonly eventBus: IEventBus,
    private readonly now: () => Date = () => new Date(),
  ) {
    eventBus.on('TimedTargetSequenceChanged', (event) => this.handleTimedTargetChanged(event));
    eventBus.on('ShotRecorded', (event) => this.handleShotRecorded(event));
  }

  async start(input: StartQualificationRecoveryRunInput): Promise<QualificationRecoveryRunRecord> {
    const existing = this.repository.findByRunId(input.runId);
    if (existing) {
      if (!qualificationRecoveryRequestMatches(existing, input)) {
        throw new Error(`Qualification recovery run ${input.runId} is bound to a different authorization`);
      }
      return existing;
    }

    const latest = this.repository.findLatest(input.competitionId);
    if (latest?.status === 'RUNNING') {
      throw new Error(`Qualification recovery run ${latest.runId} is still active`);
    }
    if (input.authorization.phase === 'SERIES_RECOVERY' && input.authorization.sightingPrerequisite) {
      const prerequisite = input.authorization.sightingPrerequisite;
      const sighting = this.repository.findByRunId(prerequisite.runId);
      if (!Number.isInteger(prerequisite.minimumPauseSeconds) || prerequisite.minimumPauseSeconds < 0) {
        throw new Error('The sighting pause must be a non-negative integer');
      }
      if (
        !sighting ||
        sighting.status !== 'COMPLETED' ||
        sighting.authorization.phase !== 'EXTRA_SIGHTING' ||
        sighting.decisionId !== input.decisionId ||
        sighting.interruptionId !== input.interruptionId ||
        sighting.competitionId !== input.competitionId ||
        sighting.stageIndex !== input.stageIndex ||
        sighting.seriesIndex !== input.seriesIndex ||
        !sighting.terminalAt
      ) {
        throw new Error('The authorized sighting prerequisite has no matching completed Lane evidence');
      }
      if (input.loadAt.getTime() < sighting.terminalAt.getTime() + prerequisite.minimumPauseSeconds * 1000) {
        throw new Error('Recovery LOAD must wait until the pause after sighting ends');
      }
    }

    const interruption = this.interruptionControl.get(input.competitionId);
    if (!interruption) throw new Error(`Competition ${input.competitionId} has no paused interruption`);
    if (interruption.interruptionId !== input.interruptionId) {
      throw new Error(
        `Interruption ${input.interruptionId} does not match the Lane record ${interruption.interruptionId}`,
      );
    }
    if (interruption.status !== 'PAUSED') {
      throw new Error(
        `Qualification recovery requires a PAUSED interruption; current status is ${interruption.status}`,
      );
    }

    const competition = await this.competitionRepository.findById(input.competitionId);
    if (!competition) throw new Error(`Competition not found: ${input.competitionId}`);
    if (competition.phase !== 'ACTIVE' && competition.phase !== 'SERIES_COMPLETE') {
      throw new Error(`Qualification recovery cannot run from competition phase ${competition.phase}`);
    }
    if (competition.config.name !== 'Qualification') {
      throw new Error('Qualification recovery requires a Qualification competition');
    }
    if (competition.currentStageIndex !== input.stageIndex || competition.currentSeriesIndex !== input.seriesIndex) {
      throw new Error(
        `Recovery context ${input.stageIndex}:${input.seriesIndex} does not match Lane ${competition.currentStageIndex}:${competition.currentSeriesIndex}`,
      );
    }

    const stage = competition.currentStageConfig;
    const series = competition.currentSeriesConfig;
    if (!stage.scored) throw new Error('Qualification recovery requires a scored stage');
    if (series.timedTargetProgramId !== input.expectedMatchProgramId) {
      throw new Error(
        `Recovery program ${input.expectedMatchProgramId} does not match Lane ${series.timedTargetProgramId ?? 'none'}`,
      );
    }
    if (series.maxShots !== input.expectedSeriesShotLimit) {
      throw new Error(`Recovery shot limit ${input.expectedSeriesShotLimit} does not match Lane ${series.maxShots}`);
    }
    if (competition.seriesShotCount !== input.expectedRecordedShots) {
      throw new Error(
        `Recovery recorded-shot count ${input.expectedRecordedShots} does not match Lane ${competition.seriesShotCount}`,
      );
    }

    const timedTarget = competition.config.timedTarget;
    if (timedTarget?.recovery.procedure !== 'QUALIFICATION') {
      throw new Error('The Lane Rule Pack has no Qualification timed-target recovery capability');
    }
    const matchProgram = timedTarget.programs.find((program) => program.id === input.expectedMatchProgramId);
    if (!matchProgram) throw new Error(`MATCH timed-target program not found: ${input.expectedMatchProgramId}`);
    const sightingProgram = stage.sightingTimedTargetProgramId
      ? timedTarget.programs.find((program) => program.id === stage.sightingTimedTargetProgramId)
      : undefined;
    this.validateAuthorizedShotCount(input, series.maxShots, competition.seriesShotCount);
    const executionProgram = buildQualificationRecoveryProgram({
      authorization: input.authorization,
      matchProgram,
      ...(sightingProgram ? { sightingProgram } : {}),
    });
    const targetProfileId = stage.targetProfileId ?? competition.config.targetProfileId;
    if (!targetProfileId) throw new Error('Qualification recovery stage has no target scoring profile');
    if (input.decidedAt.getTime() > input.loadAt.getTime()) {
      throw new Error('Qualification recovery LOAD cannot precede the official decision');
    }

    const startedAt = this.now();
    const start = createQualificationRecoveryRunStart({
      ...input,
      sequenceId: input.runId,
      executionProgramId: executionProgram.id,
      targetProfileId,
      startedAt,
    });
    this.repository.appendStarted(start);
    this.emit(this.requireRun(input.runId));

    try {
      this.timedTargetControl.start({
        sequenceId: start.sequenceId,
        competitionId: start.competitionId,
        program: executionProgram,
        stageIndex: start.stageIndex,
        seriesIndex: start.seriesIndex,
        targetProfileId: start.targetProfileId,
        loadAt: start.loadAt,
        executionContext: {
          shotDisposition: 'ISOLATED',
          owner: QUALIFICATION_RECOVERY_ACQUISITION_OWNER,
          referenceId: start.runId,
        },
      });
    } catch (error) {
      const failed = this.repository.findByRunId(start.runId);
      if (failed?.status === 'RUNNING') {
        this.repository.appendTerminal({
          runId: start.runId,
          status: 'CANCELLED',
          reason: `Timing start failed: ${error instanceof Error ? error.message : String(error)}`,
          occurredAt: this.now(),
          recordedAt: this.now(),
        });
        this.emit(this.requireRun(start.runId));
      }
      throw error;
    }
    return this.requireRun(start.runId);
  }

  cancel(input: { runId: string; reason: string; cancelledAt?: Date }): QualificationRecoveryRunRecord {
    const current = this.requireRun(input.runId);
    if (current.status === 'CANCELLED') return current;
    if (current.status === 'COMPLETED') throw new Error('A completed Qualification recovery run cannot be cancelled');
    const reason = requiredText(input.reason, 'Cancellation reason');
    const timedState = this.timedTargetControl.getState(current.competitionId);
    if (
      timedState?.sequenceId === current.sequenceId &&
      timedState.phase !== 'COMPLETE' &&
      timedState.phase !== 'CANCELLED'
    ) {
      this.timedTargetControl.cancel({
        sequenceId: current.sequenceId,
        reason,
        ...(input.cancelledAt ? { cancelledAt: input.cancelledAt } : {}),
      });
    } else {
      const cancelledAt = input.cancelledAt ?? this.now();
      this.appendTerminal(current, 'CANCELLED', reason, cancelledAt);
    }
    return this.requireRun(input.runId);
  }

  get(runId: string): QualificationRecoveryRunRecord | null {
    return this.repository.findByRunId(runId);
  }

  getLatest(competitionId?: string): QualificationRecoveryRunRecord | null {
    return this.repository.findLatest(competitionId);
  }

  restoreActive(): QualificationRecoveryRunRecord | null {
    const current = this.repository.findLatest();
    if (!current || current.status !== 'RUNNING') return current;
    const timedState = this.timedTargetControl.getState(current.competitionId);
    if (timedState?.sequenceId !== current.sequenceId) {
      this.appendTerminal(
        current,
        'CANCELLED',
        'Recovery timing sequence was unavailable during Lane restore',
        this.now(),
      );
      return this.requireRun(current.runId);
    }
    this.applyTimedTerminal(current, timedState);
    const restored = this.requireRun(current.runId);
    this.emit(restored);
    return restored;
  }

  private validateAuthorizedShotCount(
    input: StartQualificationRecoveryRunInput,
    seriesShotLimit: number,
    recordedShots: number,
  ): void {
    if (input.authorization.phase !== 'SERIES_RECOVERY') return;
    const recovery = input.authorization.seriesRecovery;
    if (recovery.treatment === 'COMPLETE_REMAINING_SHOTS') {
      const remaining = seriesShotLimit - recordedShots;
      if (recovery.shotsToFire !== remaining) {
        throw new Error(`Series completion must fire the ${remaining} remaining shot(s)`);
      }
    }
  }

  private handleShotRecorded(event: ShotRecordedEvent): void {
    const context = event.acquisitionContext;
    if (context?.owner !== QUALIFICATION_RECOVERY_ACQUISITION_OWNER) return;
    const current = this.repository.findByRunId(context.referenceId);
    if (!current || current.sequenceId !== context.referenceId) return;
    this.repository.appendShot(current.runId, {
      shotId: event.shot.id,
      observationId: event.shot.sourceObservationId ?? null,
      firedAt: event.shot.timestamp,
      recordedAt: this.now(),
    });
    this.emit(this.requireRun(current.runId));
  }

  private handleTimedTargetChanged(event: TimedTargetSequenceChangedEvent): void {
    const context = event.state.executionContext;
    if (context?.owner !== QUALIFICATION_RECOVERY_ACQUISITION_OWNER) return;
    const current = this.repository.findByRunId(context.referenceId);
    if (!current || current.status !== 'RUNNING' || current.sequenceId !== event.state.sequenceId) return;
    this.applyTimedTerminal(current, event.state);
  }

  private applyTimedTerminal(current: QualificationRecoveryRunRecord, state: TimedTargetState): void {
    if (state.phase === 'COMPLETE') {
      this.appendTerminal(
        current,
        'COMPLETED',
        'All Qualification recovery recording windows elapsed',
        state.completesAt,
      );
    } else if (state.phase === 'CANCELLED') {
      this.appendTerminal(
        current,
        'CANCELLED',
        state.terminalReason ?? 'Qualification recovery timing was cancelled',
        this.now(),
      );
    }
  }

  private appendTerminal(
    current: QualificationRecoveryRunRecord,
    status: 'COMPLETED' | 'CANCELLED',
    reason: string,
    occurredAt: Date,
  ): void {
    if (current.status !== 'RUNNING') return;
    this.repository.appendTerminal({ runId: current.runId, status, reason, occurredAt, recordedAt: this.now() });
    this.emit(this.requireRun(current.runId));
  }

  private requireRun(runId: string): QualificationRecoveryRunRecord {
    const value = this.repository.findByRunId(runId);
    if (!value) throw new Error(`Qualification recovery run ${runId} does not exist`);
    return value;
  }

  private emit(state: QualificationRecoveryRunRecord): void {
    this.eventBus.emit({
      type: 'QualificationRecoveryChanged',
      timestamp: Date.now(),
      aggregateId: state.competitionId,
      state,
    });
  }
}

function requiredText(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}
