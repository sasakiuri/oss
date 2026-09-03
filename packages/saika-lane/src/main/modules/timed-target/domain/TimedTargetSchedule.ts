// SPDX-License-Identifier: MIT
import type { TimedTargetProgram, TimedTargetPurpose } from '@sasakiuri/saika-rules';

import type { TimedTargetExecutionContext } from './TimedTargetExecutionContext';

export type TimedTargetSignal = 'RED' | 'GREEN';
export type TimedTargetSequencePhase =
  'ARMED' | 'LOAD' | 'ATTENTION' | 'FIRING' | 'AFTER_TIME' | 'BETWEEN_EXPOSURES' | 'COMPLETE' | 'CANCELLED';

export interface ScheduledTimedTargetExposure {
  readonly index: number;
  readonly greenAt: Date;
  readonly redAt: Date;
  readonly recordingClosesAt: Date;
  readonly maximumShots: number;
}

export interface TimedTargetSchedule {
  readonly sequenceId: string;
  readonly competitionId: string;
  readonly programId: string;
  readonly programLabel: string;
  readonly purpose: TimedTargetPurpose;
  readonly stageIndex: number;
  readonly seriesIndex: number;
  readonly targetProfileId: string;
  readonly ruleReference: string;
  readonly loadAt: Date;
  readonly attentionAt: Date;
  readonly exposures: readonly ScheduledTimedTargetExposure[];
  readonly completesAt: Date;
  readonly nextLoadAllowedAt: Date;
  readonly executionContext?: TimedTargetExecutionContext;
}

export interface TimedTargetProjection {
  readonly phase: Exclude<TimedTargetSequencePhase, 'CANCELLED'>;
  readonly signal: TimedTargetSignal;
  readonly shotWindowOpen: boolean;
  readonly exposureIndex: number | null;
  readonly nextTransitionAt: Date | null;
}

/** Duration from the READY/LOAD boundary through the last valid EST after-time. */
export function timedTargetProgramDurationMilliseconds(program: TimedTargetProgram): number {
  const firingAndSignals = program.exposures.reduce(
    (total, exposure) => total + exposure.nominalDurationMilliseconds + exposure.signalExtensionMilliseconds,
    0,
  );
  const interveningRed = Math.max(0, program.exposures.length - 1) * program.betweenExposuresMilliseconds;
  const finalAfterTime = program.exposures.at(-1)?.recordingAfterTimeMilliseconds ?? 0;
  return (
    program.loadPreparationSeconds * 1_000 +
    program.attentionDelayMilliseconds +
    firingAndSignals +
    interveningRed +
    finalAfterTime
  );
}

export function buildTimedTargetSchedule(input: {
  sequenceId: string;
  competitionId: string;
  program: TimedTargetProgram;
  stageIndex: number;
  seriesIndex: number;
  targetProfileId: string;
  loadAt: Date;
  executionContext?: TimedTargetExecutionContext;
}): TimedTargetSchedule {
  assertValidDate(input.loadAt, 'loadAt');
  const attentionAtMs = input.loadAt.getTime() + input.program.loadPreparationSeconds * 1_000;
  let nextGreenAtMs = attentionAtMs + input.program.attentionDelayMilliseconds;
  const exposures = input.program.exposures.map((exposure, index) => {
    const greenAtMs = nextGreenAtMs;
    const redAtMs = greenAtMs + exposure.nominalDurationMilliseconds + exposure.signalExtensionMilliseconds;
    const recordingClosesAtMs = redAtMs + exposure.recordingAfterTimeMilliseconds;
    nextGreenAtMs = redAtMs + input.program.betweenExposuresMilliseconds;
    return Object.freeze({
      index,
      greenAt: new Date(greenAtMs),
      redAt: new Date(redAtMs),
      recordingClosesAt: new Date(recordingClosesAtMs),
      maximumShots: exposure.maximumShots,
    });
  });
  const completesAt = exposures.at(-1)!.recordingClosesAt;
  return freezeSchedule({
    sequenceId: input.sequenceId,
    competitionId: input.competitionId,
    programId: input.program.id,
    programLabel: input.program.label,
    purpose: input.program.purpose,
    stageIndex: input.stageIndex,
    seriesIndex: input.seriesIndex,
    targetProfileId: input.targetProfileId,
    ruleReference: input.program.ruleReference,
    loadAt: input.loadAt,
    attentionAt: new Date(attentionAtMs),
    exposures,
    completesAt,
    nextLoadAllowedAt: new Date(completesAt.getTime() + input.program.minimumPauseAfterSeconds * 1_000),
    ...(input.executionContext ? { executionContext: validateExecutionContext(input.executionContext) } : {}),
  });
}

export function projectTimedTargetSchedule(schedule: TimedTargetSchedule, at: Date): TimedTargetProjection {
  assertValidDate(at, 'projection time');
  const atMs = at.getTime();
  if (atMs < schedule.loadAt.getTime()) {
    return projection('ARMED', 'RED', false, null, schedule.loadAt);
  }
  if (atMs < schedule.attentionAt.getTime()) {
    return projection('LOAD', 'RED', false, null, schedule.attentionAt);
  }
  const firstExposure = schedule.exposures[0]!;
  if (atMs < firstExposure.greenAt.getTime()) {
    return projection('ATTENTION', 'RED', false, null, firstExposure.greenAt);
  }

  for (let index = 0; index < schedule.exposures.length; index += 1) {
    const exposure = schedule.exposures[index]!;
    if (atMs < exposure.redAt.getTime()) {
      return projection('FIRING', 'GREEN', true, exposure.index, exposure.redAt);
    }
    if (atMs < exposure.recordingClosesAt.getTime()) {
      return projection('AFTER_TIME', 'RED', true, exposure.index, exposure.recordingClosesAt);
    }
    const nextExposure = schedule.exposures[index + 1];
    if (nextExposure && atMs < nextExposure.greenAt.getTime()) {
      return projection('BETWEEN_EXPOSURES', 'RED', false, null, nextExposure.greenAt);
    }
  }

  return projection('COMPLETE', 'RED', false, null, null);
}

export function serializeTimedTargetSchedule(schedule: TimedTargetSchedule): string {
  return JSON.stringify(schedule);
}

export function parseTimedTargetSchedule(payload: string): TimedTargetSchedule {
  const value = JSON.parse(payload) as Omit<
    TimedTargetSchedule,
    'loadAt' | 'attentionAt' | 'completesAt' | 'nextLoadAllowedAt' | 'exposures'
  > & {
    loadAt: string;
    attentionAt: string;
    completesAt: string;
    nextLoadAllowedAt: string;
    exposures: Array<
      Omit<ScheduledTimedTargetExposure, 'greenAt' | 'redAt' | 'recordingClosesAt'> & {
        greenAt: string;
        redAt: string;
        recordingClosesAt: string;
      }
    >;
  };
  return freezeSchedule({
    ...value,
    loadAt: requiredDate(value.loadAt, 'loadAt'),
    attentionAt: requiredDate(value.attentionAt, 'attentionAt'),
    completesAt: requiredDate(value.completesAt, 'completesAt'),
    nextLoadAllowedAt: requiredDate(value.nextLoadAllowedAt, 'nextLoadAllowedAt'),
    exposures: value.exposures.map((exposure) => ({
      ...exposure,
      greenAt: requiredDate(exposure.greenAt, 'greenAt'),
      redAt: requiredDate(exposure.redAt, 'redAt'),
      recordingClosesAt: requiredDate(exposure.recordingClosesAt, 'recordingClosesAt'),
    })),
    ...(value.executionContext ? { executionContext: validateExecutionContext(value.executionContext) } : {}),
  });
}

function projection(
  phase: TimedTargetProjection['phase'],
  signal: TimedTargetSignal,
  shotWindowOpen: boolean,
  exposureIndex: number | null,
  nextTransitionAt: Date | null,
): TimedTargetProjection {
  return Object.freeze({ phase, signal, shotWindowOpen, exposureIndex, nextTransitionAt });
}

function freezeSchedule(schedule: TimedTargetSchedule): TimedTargetSchedule {
  return Object.freeze({
    ...schedule,
    loadAt: new Date(schedule.loadAt.getTime()),
    attentionAt: new Date(schedule.attentionAt.getTime()),
    completesAt: new Date(schedule.completesAt.getTime()),
    nextLoadAllowedAt: new Date(schedule.nextLoadAllowedAt.getTime()),
    exposures: Object.freeze(
      schedule.exposures.map((exposure) =>
        Object.freeze({
          ...exposure,
          greenAt: new Date(exposure.greenAt.getTime()),
          redAt: new Date(exposure.redAt.getTime()),
          recordingClosesAt: new Date(exposure.recordingClosesAt.getTime()),
        }),
      ),
    ),
    ...(schedule.executionContext ? { executionContext: Object.freeze({ ...schedule.executionContext }) } : {}),
  });
}

function validateExecutionContext(context: TimedTargetExecutionContext): TimedTargetExecutionContext {
  if (context.shotDisposition !== 'ISOLATED') throw new Error('Timed target shotDisposition is invalid');
  const owner = context.owner.trim();
  const referenceId = context.referenceId.trim();
  if (!owner) throw new Error('Timed target execution context owner is required');
  if (owner.length > 100) throw new Error('Timed target execution context owner must not exceed 100 characters');
  if (!referenceId) throw new Error('Timed target execution context referenceId is required');
  if (referenceId.length > 200)
    throw new Error('Timed target execution context referenceId must not exceed 200 characters');
  return Object.freeze({ shotDisposition: 'ISOLATED', owner, referenceId });
}

function requiredDate(value: string, name: string): Date {
  const date = new Date(value);
  assertValidDate(date, name);
  return date;
}

function assertValidDate(value: Date, name: string): void {
  if (!Number.isFinite(value.getTime())) throw new Error(`${name} must be a valid date`);
}
