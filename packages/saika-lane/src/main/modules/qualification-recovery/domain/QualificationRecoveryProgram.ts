// SPDX-License-Identifier: MIT
import type {
  QualificationTimedTargetSeriesRecoveryRecommendation,
  TimedTargetExposure,
  TimedTargetProgram,
} from '@sasakiuri/saika-rules';

export type QualificationRecoveryFiringAuthorization =
  | {
      readonly phase: 'EXTRA_SIGHTING';
      readonly shotsToFire: number;
    }
  | {
      readonly phase: 'SERIES_RECOVERY';
      readonly seriesRecovery: QualificationTimedTargetSeriesRecoveryRecommendation;
      readonly sightingPrerequisite?: { readonly runId: string; readonly minimumPauseSeconds: number };
    };

export interface QualificationRecoveryProgramInput {
  readonly authorization: QualificationRecoveryFiringAuthorization;
  readonly matchProgram: TimedTargetProgram;
  readonly sightingProgram?: TimedTargetProgram;
}

/**
 * Converts an already-authorized Qualification remedy into a timing program.
 * This function does not recommend, authorize, score, or mutate a series.
 */
export function buildQualificationRecoveryProgram(input: QualificationRecoveryProgramInput): TimedTargetProgram {
  if (input.authorization.phase === 'EXTRA_SIGHTING') {
    if (!input.sightingProgram) throw new Error('The current stage has no sighting timed-target program');
    if (input.sightingProgram.purpose !== 'SIGHTING') {
      throw new Error('Qualification extra sighting requires a SIGHTING program');
    }
    return limitProgramToShots(input.sightingProgram, input.authorization.shotsToFire, 'extra sighting');
  }

  if (input.matchProgram.purpose !== 'MATCH') {
    throw new Error('Qualification series recovery requires a MATCH program');
  }
  const recovery = input.authorization.seriesRecovery;
  if (recovery.treatment === 'KEEP_RECORDED_SERIES') {
    throw new Error('KEEP_RECORDED_SERIES does not require a firing program');
  }
  positiveInteger(recovery.shotsToFire, 'seriesRecovery.shotsToFire');

  if (recovery.treatment === 'ANNUL_AND_REPEAT') {
    const programShots = maximumShots(input.matchProgram);
    if (recovery.shotsToFire !== programShots) {
      throw new Error(`ANNUL_AND_REPEAT must fire the complete ${programShots}-shot program`);
    }
    return input.matchProgram;
  }

  if (recovery.execution.mode === 'SECONDS_PER_SHOT') {
    positiveInteger(recovery.execution.secondsPerShot, 'seriesRecovery.execution.secondsPerShot');
    if (recovery.execution.totalSeconds !== recovery.execution.secondsPerShot * recovery.shotsToFire) {
      throw new Error('Recovery totalSeconds must equal secondsPerShot multiplied by shotsToFire');
    }
    const referenceExposure = input.matchProgram.exposures[0];
    if (!referenceExposure) throw new Error('The MATCH program has no exposure');
    return copyProgram(input.matchProgram, [
      {
        ...referenceExposure,
        nominalDurationMilliseconds: recovery.execution.totalSeconds * 1_000,
        maximumShots: recovery.shotsToFire,
      },
    ]);
  }

  return limitProgramToShots(input.matchProgram, recovery.shotsToFire, 'series completion');
}

function limitProgramToShots(program: TimedTargetProgram, shotsToFire: number, label: string): TimedTargetProgram {
  positiveInteger(shotsToFire, 'shotsToFire');
  const availableShots = maximumShots(program);
  if (shotsToFire > availableShots) {
    throw new Error(`Authorized ${label} shots (${shotsToFire}) exceed program capacity (${availableShots})`);
  }

  let remaining = shotsToFire;
  const exposures: TimedTargetExposure[] = [];
  for (const exposure of program.exposures) {
    if (remaining === 0) break;
    const maximumShots = Math.min(exposure.maximumShots, remaining);
    exposures.push({ ...exposure, maximumShots });
    remaining -= maximumShots;
  }
  if (remaining !== 0) throw new Error(`The ${label} program cannot represent the authorized shot count`);
  return copyProgram(program, exposures);
}

function copyProgram(program: TimedTargetProgram, exposures: readonly TimedTargetExposure[]): TimedTargetProgram {
  return Object.freeze({
    ...program,
    exposures: Object.freeze(exposures.map((exposure) => Object.freeze({ ...exposure }))),
  });
}

function maximumShots(program: TimedTargetProgram): number {
  return program.exposures.reduce((total, exposure) => total + exposure.maximumShots, 0);
}

function positiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
}
