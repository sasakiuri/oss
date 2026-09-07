import type { RecoveryFiringPlan } from './RecoveryFiringPlan';
import type { FinalTimedTargetRecoveryCapability, TimedTargetProgram } from './RulePack';

/** Builds a 25m Final recovery program after a separate Jury authorization. */
export function planFinalRecoveryFiring(input: {
  incidentType: 'MALFUNCTION' | 'EST_FAILURE';
  recovery: FinalTimedTargetRecoveryCapability;
  matchProgram: TimedTargetProgram;
  seriesShotLimit: number;
  recordedShots: number;
}): RecoveryFiringPlan {
  const { recovery, matchProgram, seriesShotLimit, recordedShots } = input;
  if (recovery.procedure !== 'FINAL' || matchProgram.purpose !== 'MATCH')
    throw new Error('Final recovery requires a Final MATCH program');
  if (
    !Number.isInteger(seriesShotLimit) ||
    seriesShotLimit <= 0 ||
    !Number.isInteger(recordedShots) ||
    recordedShots < 0 ||
    recordedShots > seriesShotLimit
  )
    throw new Error('Invalid original series shot count');
  const capacity = matchProgram.exposures.reduce((sum, exposure) => sum + exposure.maximumShots, 0);
  if (capacity !== seriesShotLimit) throw new Error('Final program capacity differs from the original series');
  const repeat = recovery.allowableMalfunctionRemedy === 'REPEAT_SERIES';
  const remainingShots = seriesShotLimit - recordedShots;
  const shotsToFire = repeat ? seriesShotLimit : input.incidentType === 'EST_FAILURE' ? 1 : remainingShots;
  if (!repeat && input.incidentType === 'MALFUNCTION' && remainingShots <= 0)
    throw new Error('The Final series has no remaining shots');
  if (!repeat && matchProgram.exposures.some((exposure) => exposure.maximumShots !== 1))
    throw new Error('Final completion requires single-shot exposures');
  return Object.freeze({
    remedy: repeat ? 'REPEAT_FULL_SERIES' : 'COMPLETE_REMAINING_SHOTS',
    shotsToFire,
    ruleReference: recovery.ruleReferences.join(', '),
    program: Object.freeze({
      ...matchProgram,
      // The schedule begins at READY in Finals; a malfunction uses the specific readiness limit.
      loadPreparationSeconds:
        input.incidentType === 'MALFUNCTION' ? recovery.remedyReadySeconds : matchProgram.loadPreparationSeconds,
      exposures: Object.freeze(
        (repeat ? matchProgram.exposures : matchProgram.exposures.slice(0, shotsToFire)).map((exposure) =>
          Object.freeze({ ...exposure }),
        ),
      ),
    }),
  });
}
