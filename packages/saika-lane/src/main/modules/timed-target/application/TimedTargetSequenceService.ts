// SPDX-License-Identifier: MIT
import type { TimedTargetPurpose } from '@sasakiuri/saika-rules';

import type { ITimedTargetCommandPause, UnloadObservationInput } from '../domain/ITimedTargetCommandPause';
import type {
  ITimedTargetControl,
  ITimedTargetStateSink,
  TimedTargetEnforcementMode,
  TimedTargetShotDecision,
  TimedTargetState,
} from '../domain/ITimedTargetControl';
import type {
  ITimedTargetSequenceRepository,
  TimedTargetSequenceRecord,
} from '../domain/ITimedTargetSequenceRepository';
import {
  buildTimedTargetSchedule,
  projectTimedTargetSchedule,
  serializeTimedTargetSchedule,
  type TimedTargetProjection,
} from '../domain/TimedTargetSchedule';

export interface TimedTargetClock {
  now(): Date;
  setTimeout(callback: () => void, delayMilliseconds: number): ReturnType<typeof setTimeout>;
  clearTimeout(handle: ReturnType<typeof setTimeout>): void;
}

const systemClock: TimedTargetClock = {
  now: () => new Date(),
  setTimeout: (callback, delayMilliseconds) => setTimeout(callback, delayMilliseconds),
  clearTimeout: (handle) => clearTimeout(handle),
};

export class TimedTargetSequenceService implements ITimedTargetControl {
  private transitionTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly repository: ITimedTargetSequenceRepository,
    private readonly sink: ITimedTargetStateSink,
    readonly enforcementMode: TimedTargetEnforcementMode = 'REQUIRED',
    private readonly clock: TimedTargetClock = systemClock,
    private readonly commandPause?: ITimedTargetCommandPause,
  ) {}

  start(input: Parameters<ITimedTargetControl['start']>[0]): TimedTargetState {
    const requestedSchedule = buildTimedTargetSchedule(input);
    const existing = this.repository.findBySequenceId(input.sequenceId);
    if (existing) {
      if (serializeTimedTargetSchedule(existing.schedule) !== serializeTimedTargetSchedule(requestedSchedule)) {
        throw new Error(`Timed target sequence ID ${input.sequenceId} is already bound to a different schedule`);
      }
      this.activate(existing);
      return this.toState(existing, this.clock.now());
    }

    this.refresh(input.competitionId);
    const latest = this.repository.findLatest(input.competitionId);
    if (latest?.terminalStatus === null) {
      throw new Error(`Timed target sequence ${latest.schedule.sequenceId} is still active`);
    }
    if (latest) {
      const pause = this.commandPause?.assess(latest, input.loadAt);
      if (pause?.blocked) throw new Error('Record UNLOAD and wait for the required command pause before LOAD');
      const nextLoadAllowedAt = this.effectiveNextLoadAllowedAt(latest);
      if (input.loadAt.getTime() < nextLoadAllowedAt.getTime()) {
        throw new Error(`Next LOAD is not permitted before ${nextLoadAllowedAt.toISOString()}`);
      }
    }

    const now = this.clock.now();
    this.repository.appendStarted(requestedSchedule, now);
    const record = this.repository.findBySequenceId(requestedSchedule.sequenceId);
    if (!record) throw new Error('Timed target sequence could not be restored after start');
    this.activate(record);
    return this.toState(record, now);
  }

  recordUnload(input: UnloadObservationInput): TimedTargetState {
    if (!this.commandPause) throw new Error('Command observation journal is unavailable');
    const initial = this.repository.findBySequenceId(input.sequenceId);
    if (!initial) throw new Error('UNLOAD sequence does not exist');
    this.refresh(initial.schedule.competitionId);
    const record = this.repository.findLatest(initial.schedule.competitionId);
    if (!record || record.schedule.sequenceId !== input.sequenceId)
      throw new Error('UNLOAD sequence is no longer current');
    const now = this.clock.now();
    this.commandPause.recordUnload(record, input, now);
    const state = this.toState(record, now);
    this.publish(state);
    return state;
  }

  cancel(input: Parameters<ITimedTargetControl['cancel']>[0]): TimedTargetState {
    const record = this.repository.findBySequenceId(input.sequenceId);
    if (!record) throw new Error(`Timed target sequence ${input.sequenceId} does not exist`);
    if (record.terminalStatus === 'CANCELLED') return this.toState(record, this.clock.now());
    if (record.terminalStatus === 'COMPLETED') throw new Error('A completed timed target sequence cannot be cancelled');
    const cancelledAt = input.cancelledAt ?? this.clock.now();
    this.repository.appendTerminal({
      sequenceId: input.sequenceId,
      status: 'CANCELLED',
      reason: requiredText(input.reason, 'Cancellation reason'),
      occurredAt: cancelledAt,
      recordedAt: this.clock.now(),
    });
    this.clearTransitionTimer();
    const cancelled = this.repository.findBySequenceId(input.sequenceId)!;
    const state = this.toState(cancelled, cancelledAt);
    this.publish(state);
    return state;
  }

  getState(competitionId?: string): TimedTargetState | null {
    return this.refresh(competitionId);
  }

  tryAcceptShot(input: Parameters<ITimedTargetControl['tryAcceptShot']>[0]): TimedTargetShotDecision {
    const latest = this.repository.findLatest(input.competitionId);
    const contextual =
      latest?.schedule.stageIndex === input.stageIndex && latest.schedule.seriesIndex === input.seriesIndex
        ? latest
        : null;

    if (this.enforcementMode === 'DISABLED') {
      return decision({
        allowed: true,
        purpose: contextual?.schedule.purpose ?? 'MATCH',
        targetProfileId: contextual?.schedule.targetProfileId ?? input.targetProfileId,
        sequenceId: contextual?.schedule.sequenceId ?? null,
        exposureIndex: null,
        warning: null,
        reason: 'Timed target enforcement is disabled by local policy',
        ...(contextual?.schedule.executionContext ? { executionContext: contextual.schedule.executionContext } : {}),
      });
    }

    if (!contextual || contextual.schedule.competitionId !== input.competitionId) {
      const expectedProgramId = input.expectedShootOffProgramId ?? input.expectedMatchProgramId;
      return this.outsideWindowDecision(
        input.expectedShootOffProgramId ? 'SHOOT_OFF' : 'MATCH',
        input.targetProfileId,
        null,
        null,
        `No timed target sequence is available for program ${expectedProgramId ?? 'the current series'}`,
      );
    }

    const expectedProgramId =
      contextual.schedule.purpose === 'SIGHTING'
        ? input.expectedSightingProgramId
        : contextual.schedule.purpose === 'SHOOT_OFF'
          ? input.expectedShootOffProgramId
          : input.expectedMatchProgramId;
    if (!expectedProgramId || contextual.schedule.programId !== expectedProgramId) {
      return this.outsideWindowDecision(
        contextual.schedule.purpose,
        contextual.schedule.targetProfileId,
        contextual.schedule.sequenceId,
        null,
        `Timed target program ${contextual.schedule.programId} does not match the expected ${expectedProgramId ?? 'sighting program'}`,
        contextual.schedule.executionContext,
      );
    }

    const projection = projectTimedTargetSchedule(contextual.schedule, input.firedAt);
    if (!projection.shotWindowOpen || projection.exposureIndex === null || contextual.terminalStatus === 'CANCELLED') {
      return this.outsideWindowDecision(
        contextual.schedule.purpose,
        contextual.schedule.targetProfileId,
        contextual.schedule.sequenceId,
        projection.exposureIndex,
        contextual.terminalStatus === 'CANCELLED'
          ? `Timed target sequence was cancelled: ${contextual.terminalReason ?? 'no reason recorded'}`
          : `Shot was observed during timed target phase ${projection.phase}`,
        contextual.schedule.executionContext,
      );
    }

    const exposure = contextual.schedule.exposures[projection.exposureIndex]!;
    const alreadyRecorded = contextual.acceptedShots.find((shot) => shot.observationId === input.observationId);
    if (alreadyRecorded) {
      return decision({
        allowed: true,
        purpose: contextual.schedule.purpose,
        targetProfileId: contextual.schedule.targetProfileId,
        sequenceId: contextual.schedule.sequenceId,
        exposureIndex: alreadyRecorded.exposureIndex,
        warning: null,
        reason: 'Observation was already accepted in this timed target exposure',
        ...(contextual.schedule.executionContext ? { executionContext: contextual.schedule.executionContext } : {}),
      });
    }
    const acceptedCount = contextual.acceptedShots.filter(
      (shot) => shot.exposureIndex === projection.exposureIndex,
    ).length;
    if (acceptedCount >= exposure.maximumShots) {
      return this.outsideWindowDecision(
        contextual.schedule.purpose,
        contextual.schedule.targetProfileId,
        contextual.schedule.sequenceId,
        projection.exposureIndex,
        `Exposure ${projection.exposureIndex + 1} already contains its maximum of ${exposure.maximumShots} shot(s)`,
        contextual.schedule.executionContext,
      );
    }

    this.repository.appendAcceptedShot({
      id: crypto.randomUUID(),
      sequenceId: contextual.schedule.sequenceId,
      observationId: input.observationId,
      exposureIndex: projection.exposureIndex,
      firedAt: input.firedAt,
      recordedAt: this.clock.now(),
    });
    const updated = this.repository.findBySequenceId(contextual.schedule.sequenceId)!;
    this.publish(this.toState(updated, this.clock.now()));
    return decision({
      allowed: true,
      purpose: contextual.schedule.purpose,
      targetProfileId: contextual.schedule.targetProfileId,
      sequenceId: contextual.schedule.sequenceId,
      exposureIndex: projection.exposureIndex,
      warning: null,
      reason: 'Shot is inside the valid EST recording window',
      ...(contextual.schedule.executionContext ? { executionContext: contextual.schedule.executionContext } : {}),
    });
  }

  restore(): void {
    const latest = this.repository.findLatest();
    if (!latest) return;
    this.activate(latest);
  }

  dispose(): void {
    this.clearTransitionTimer();
  }

  private outsideWindowDecision(
    purpose: TimedTargetPurpose,
    targetProfileId: string,
    sequenceId: string | null,
    exposureIndex: number | null,
    reason: string,
    executionContext?: TimedTargetState['executionContext'],
  ): TimedTargetShotDecision {
    const allowed = this.enforcementMode === 'ADVISORY';
    return decision({
      allowed,
      purpose,
      targetProfileId,
      sequenceId,
      exposureIndex,
      warning: allowed ? reason : null,
      reason,
      ...(executionContext ? { executionContext } : {}),
    });
  }

  private activate(record: TimedTargetSequenceRecord): void {
    this.clearTransitionTimer();
    const state = this.finalizeIfElapsed(record, this.clock.now());
    this.publish(state);
    if (state.phase === 'COMPLETE' || state.phase === 'CANCELLED' || !state.nextTransitionAt) return;
    const delay = Math.max(0, state.nextTransitionAt.getTime() - this.clock.now().getTime());
    this.transitionTimer = this.clock.setTimeout(() => {
      this.transitionTimer = null;
      const current = this.repository.findBySequenceId(record.schedule.sequenceId);
      if (current) this.activate(current);
    }, delay);
  }

  private refresh(competitionId?: string): TimedTargetState | null {
    const latest = this.repository.findLatest(competitionId);
    if (!latest) return null;
    const state = this.finalizeIfElapsed(latest, this.clock.now());
    if (state.phase !== 'COMPLETE' && state.phase !== 'CANCELLED') this.activate(latest);
    return state;
  }

  private finalizeIfElapsed(record: TimedTargetSequenceRecord, at: Date): TimedTargetState {
    const projection = projectTimedTargetSchedule(record.schedule, at);
    if (projection.phase === 'COMPLETE' && record.terminalStatus === null) {
      this.repository.appendTerminal({
        sequenceId: record.schedule.sequenceId,
        status: 'COMPLETED',
        reason: 'All valid EST recording windows elapsed',
        occurredAt: record.schedule.completesAt,
        recordedAt: this.clock.now(),
      });
      const completed = this.repository.findBySequenceId(record.schedule.sequenceId)!;
      return this.toState(completed, at, projection);
    }
    return this.toState(record, at, projection);
  }

  private toState(
    record: TimedTargetSequenceRecord,
    at: Date,
    projected: TimedTargetProjection = projectTimedTargetSchedule(record.schedule, at),
  ): TimedTargetState {
    const phase = record.terminalStatus === 'CANCELLED' ? 'CANCELLED' : projected.phase;
    const exposureIndex = phase === 'CANCELLED' ? null : projected.exposureIndex;
    return Object.freeze({
      sequenceId: record.schedule.sequenceId,
      competitionId: record.schedule.competitionId,
      programId: record.schedule.programId,
      programLabel: record.schedule.programLabel,
      purpose: record.schedule.purpose,
      stageIndex: record.schedule.stageIndex,
      seriesIndex: record.schedule.seriesIndex,
      targetProfileId: record.schedule.targetProfileId,
      ruleReference: record.schedule.ruleReference,
      phase,
      signal: phase === 'CANCELLED' ? 'RED' : projected.signal,
      shotWindowOpen: phase === 'CANCELLED' ? false : projected.shotWindowOpen,
      exposureIndex,
      exposureCount: record.schedule.exposures.length,
      acceptedShotsInExposure:
        exposureIndex === null ? 0 : record.acceptedShots.filter((shot) => shot.exposureIndex === exposureIndex).length,
      loadAt: new Date(record.schedule.loadAt.getTime()),
      attentionAt: new Date(record.schedule.attentionAt.getTime()),
      completesAt: new Date(record.schedule.completesAt.getTime()),
      nextLoadAllowedAt: this.effectiveNextLoadAllowedAt(record),
      nextTransitionAt:
        phase === 'CANCELLED' || record.terminalStatus === 'COMPLETED'
          ? null
          : projected.nextTransitionAt
            ? new Date(projected.nextTransitionAt.getTime())
            : null,
      terminalReason: record.terminalReason,
      ...(this.commandPause ? { commandPause: this.commandPause.assess(record, at) } : {}),
      ...(record.schedule.executionContext
        ? { executionContext: Object.freeze({ ...record.schedule.executionContext }) }
        : {}),
    });
  }

  private effectiveNextLoadAllowedAt(record: TimedTargetSequenceRecord): Date {
    if (record.terminalStatus !== 'CANCELLED' || !record.terminalAt) {
      const pause = this.commandPause?.assess(record, this.clock.now());
      return new Date(
        Math.max(
          record.schedule.nextLoadAllowedAt.getTime(),
          pause?.mode === 'REQUIRED' && pause.nextLoadAllowedAt ? Date.parse(pause.nextLoadAllowedAt) : 0,
        ),
      );
    }
    const pauseMilliseconds = record.schedule.nextLoadAllowedAt.getTime() - record.schedule.completesAt.getTime();
    const pause = this.commandPause?.assess(record, this.clock.now());
    return new Date(
      Math.max(
        record.terminalAt.getTime() + pauseMilliseconds,
        pause?.mode === 'REQUIRED' && pause.nextLoadAllowedAt ? Date.parse(pause.nextLoadAllowedAt) : 0,
      ),
    );
  }

  private publish(state: TimedTargetState): void {
    try {
      this.sink.publish(state);
    } catch {
      // A renderer, MQTT, or physical-output adapter must not corrupt the
      // authoritative schedule or reopen a shot window when it fails.
    }
  }

  private clearTransitionTimer(): void {
    if (!this.transitionTimer) return;
    this.clock.clearTimeout(this.transitionTimer);
    this.transitionTimer = null;
  }
}

export function timedTargetEnforcementModeFromEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
): TimedTargetEnforcementMode {
  const value = environment.SAIKA_TIMED_TARGET_ENFORCEMENT?.trim().toUpperCase();
  if (!value) return 'REQUIRED';
  if (value === 'DISABLED' || value === 'ADVISORY' || value === 'REQUIRED') return value;
  throw new Error('SAIKA_TIMED_TARGET_ENFORCEMENT must be DISABLED, ADVISORY, or REQUIRED');
}

function decision(input: Omit<TimedTargetShotDecision, 'governed'>): TimedTargetShotDecision {
  return Object.freeze({ governed: true, ...input });
}

function requiredText(value: string, name: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${name} is required`);
  return trimmed;
}
