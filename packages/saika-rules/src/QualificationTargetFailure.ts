// SPDX-License-Identifier: MIT
import {
  recommendSeriesRecovery,
  type QualificationTimedTargetInterruptionFacts,
  type QualificationTimedTargetInterruptionRecommendation,
} from './QualificationTimedTargetInterruption';
import type { QualificationTimedTargetRecoveryCapability } from './RulePack';
import { validateNonNegativeInteger } from './validation/primitives';

/** Rule 8.10.1-2 target-system recovery. Missing-shot complaints use a separate procedure. */
export function recommendQualificationTargetFailure(
  policy: NonNullable<QualificationTimedTargetRecoveryCapability['targetFailure']>,
  facts: QualificationTimedTargetInterruptionFacts,
): QualificationTimedTargetInterruptionRecommendation {
  validateNonNegativeInteger(facts.interruptionSeconds, 'interruptionSeconds');
  validateNonNegativeInteger(facts.recordedShots, 'recordedShots');
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
  return {
    type: 'QUALIFICATION_TIMED_TARGET',
    interruptionSeconds: facts.interruptionSeconds,
    stageId: facts.stageId,
    extraSighting: { required: true, shots: policy.extraSightingSeriesShots },
    minimumPauseAfterSightingSeconds: policy.minimumPauseAfterSightingSeconds,
    seriesRecovery: recommendSeriesRecovery(stage.seriesRecovery, facts.seriesShotLimit, facts.recordedShots),
    ruleReferences: [...policy.ruleReferences, stage.ruleReference],
    explanation:
      'After the target system is operational, allow an additional sighting series and the specified pause. Retain fully recorded series; otherwise apply the event-specific completion or repetition. A missing-shot complaint alone does not authorize a repeat series (8.10.3).',
  };
}
