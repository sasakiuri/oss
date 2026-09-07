import type { QualificationMalfunctionStageRule } from './QualificationMalfunction';
import type { RecoveryFiringPlan as QualificationMalfunctionFiringPlan } from './RecoveryFiringPlan';
import type { TimedTargetExposure, TimedTargetProgram } from './RulePack';

export type { RecoveryFiringPlan as QualificationMalfunctionFiringPlan } from './RecoveryFiringPlan';

/** Projects timing for an already-authorized remedy; never grants a claim or changes scores. */
export function planQualificationMalfunctionFiring(input: {
  readonly stageRule: QualificationMalfunctionStageRule;
  readonly matchProgram: TimedTargetProgram;
  readonly seriesShotLimit: number;
  readonly recordedShots: number;
}): QualificationMalfunctionFiringPlan {
  const { stageRule, matchProgram, seriesShotLimit, recordedShots } = input;
  if (!Number.isInteger(seriesShotLimit) || seriesShotLimit <= 0) throw new Error('Invalid series shot limit');
  if (!Number.isInteger(recordedShots) || recordedShots < 0 || recordedShots > seriesShotLimit)
    throw new Error('Recorded shots must be within the original series');
  if (matchProgram.purpose !== 'MATCH') throw new Error('Malfunction recovery requires a MATCH program');
  const capacity = matchProgram.exposures.reduce((sum, exposure) => sum + exposure.maximumShots, 0);
  if (capacity !== seriesShotLimit) throw new Error('MATCH program capacity differs from the original series');
  const treatment = stageRule.allowableTreatment;
  if (treatment.type === 'CONTINUE_WITHIN_ORIGINAL_TIME')
    throw new Error('Continuation does not authorize a separate firing program');

  const shotsToFire = treatment.type === 'REPEAT_FULL_SERIES' ? treatment.shots : seriesShotLimit - recordedShots;
  if (!Number.isInteger(shotsToFire) || shotsToFire <= 0 || shotsToFire > capacity)
    throw new Error('The remedy must authorize a positive number of available shots');
  let exposures: readonly TimedTargetExposure[];
  if (treatment.type === 'REPEAT_FULL_SERIES') {
    if (shotsToFire !== seriesShotLimit) throw new Error('A malfunction repeat must fire the full series');
    exposures = matchProgram.exposures;
  } else if (treatment.execution.mode === 'SECONDS_PER_SHOT') {
    const seconds = treatment.execution.secondsPerShot;
    if (!Number.isInteger(seconds) || seconds <= 0) throw new Error('Invalid completion time per shot');
    if (matchProgram.exposures.length !== 1)
      throw new Error('Seconds-per-shot completion requires one continuous MATCH exposure');
    exposures = [
      {
        ...matchProgram.exposures[0]!,
        nominalDurationMilliseconds: shotsToFire * seconds * 1000,
        maximumShots: shotsToFire,
      },
    ];
  } else {
    if (matchProgram.exposures.some((exposure) => exposure.maximumShots !== 1))
      throw new Error('Completion from the first exposure requires single-shot exposures');
    exposures = matchProgram.exposures.slice(0, shotsToFire);
  }
  return Object.freeze({
    remedy: treatment.type,
    shotsToFire,
    ruleReference: stageRule.ruleReference,
    program: Object.freeze({
      ...matchProgram,
      ...(matchProgram.unloadPause ? { unloadPause: Object.freeze({ ...matchProgram.unloadPause }) } : {}),
      exposures: Object.freeze(exposures.map((exposure) => Object.freeze({ ...exposure }))),
    }),
  });
}
