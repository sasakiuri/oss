// SPDX-License-Identifier: MIT
import type {
  QualificationTimedTargetInterruptionFacts,
  QualificationTimedTargetInterruptionRecommendation,
  QualificationTimedTargetSeriesRecoveryRecommendation,
} from './QualificationTimedTargetInterruption';
import type { QualificationTimedTargetRecoveryCapability } from './RulePack';

/** Rule 8.10.1-2 target-system recovery. Missing-shot complaints use a separate procedure. */
export function recommendQualificationTargetFailure(
  policy: NonNullable<QualificationTimedTargetRecoveryCapability['targetFailure']>,
  facts: QualificationTimedTargetInterruptionFacts,
): QualificationTimedTargetInterruptionRecommendation {
  for (const [name, value] of Object.entries({
    interruptionSeconds: facts.interruptionSeconds,
    recordedShots: facts.recordedShots,
  })) {
    if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`);
  }
  if (
    !Number.isInteger(facts.seriesShotLimit) ||
    facts.seriesShotLimit <= 0 ||
    facts.recordedShots > facts.seriesShotLimit
  ) {
    throw new Error('Target failure requires a valid series shot count');
  }
  if (facts.seriesComplete && facts.recordedShots !== facts.seriesShotLimit) {
    throw new Error('A completed series must contain its full recorded shot count');
  }
  const stage = policy.stages.find((candidate) => candidate.stageId === facts.stageId);
  if (!stage) throw new Error(`No target-failure recovery rule exists for stage ${facts.stageId}`);
  const remaining = facts.seriesShotLimit - facts.recordedShots;
  let seriesRecovery: QualificationTimedTargetSeriesRecoveryRecommendation;
  if (remaining === 0) {
    seriesRecovery = { treatment: 'KEEP_RECORDED_SERIES', shotsToFire: 0, execution: null };
  } else if (stage.seriesRecovery.treatment === 'ANNUL_AND_REPEAT') {
    seriesRecovery = {
      treatment: 'ANNUL_AND_REPEAT',
      shotsToFire: facts.seriesShotLimit,
      execution: { mode: 'SAME_TIMED_TARGET_PROGRAM' },
    };
  } else {
    const completion = stage.seriesRecovery.completion;
    seriesRecovery = {
      treatment: 'COMPLETE_REMAINING_SHOTS',
      shotsToFire: remaining,
      execution:
        completion.mode === 'SECONDS_PER_SHOT'
          ? { ...completion, totalSeconds: completion.secondsPerShot * remaining }
          : { ...completion },
    };
  }
  return {
    type: 'QUALIFICATION_TIMED_TARGET',
    interruptionSeconds: facts.interruptionSeconds,
    stageId: facts.stageId,
    extraSighting: { required: true, shots: policy.extraSightingSeriesShots },
    minimumPauseAfterSightingSeconds: policy.minimumPauseAfterSightingSeconds,
    seriesRecovery,
    ruleReferences: [...policy.ruleReferences, stage.ruleReference],
    explanation:
      'After the target system is operational, allow an additional sighting series and the specified pause. Retain fully recorded series; otherwise apply the event-specific completion or repetition. A missing-shot complaint alone does not authorize a repeat series (8.10.3).',
  };
}
