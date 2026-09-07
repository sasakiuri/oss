import {
  recommendQualificationTimedTargetInterruption,
  recommendQualificationTargetFailure,
  type QualificationTimedTargetInterruptionRecommendation,
} from '@sasakiuri/saika-rules';

import { recommendIssfInterruption, type IssfInterruptionRecommendation } from './IssfInterruptionPolicy';
import type { RangeInterruptionCase } from './RangeInterruptionCase';
import type { TargetRecoveryAssessment } from './TargetRecoveryAssessment';

export type RangeInterruptionRecommendation =
  IssfInterruptionRecommendation | QualificationTimedTargetInterruptionRecommendation;

/** Selects a snapshotted event policy before falling back to the generic ISSF time policy. */
export function recommendRangeInterruption(
  interruption: RangeInterruptionCase,
  lostTimeSeconds: number,
  targetRecovery: TargetRecoveryAssessment | null = null,
): RangeInterruptionRecommendation {
  const context = interruption.qualificationTimedTargetContext;
  if (context) {
    const facts = {
      stageId: context.stageId,
      interruptionSeconds: lostTimeSeconds,
      seriesShotLimit: context.seriesShotLimit,
      recordedShots: context.recordedShots,
      seriesComplete: context.seriesComplete,
    };
    if (interruption.cause === 'ALL_TARGET_FAILURE' || interruption.cause === 'SINGLE_TARGET_FAILURE') {
      if (!context.recoveryCapability.targetFailure) {
        return {
          type: 'MATCH_TIME',
          basis: 'MANUAL_REVIEW',
          lostTimeSeconds,
          baseRemainingSeconds: interruption.remainingSecondsAtStart,
          suggestedAdditionalSeconds: 0,
          suggestedAuthorizedRemainingSeconds: interruption.remainingSecondsAtStart,
          unlimitedSightingShots: false,
          ruleReferences: 'ISSF 8.10',
          explanation:
            'The captured Rule Pack has no target-failure policy. Preserve this legacy case and create a separately reviewed recovery case with the current policy; no automatic remedy is suggested.',
        };
      }
      return recommendQualificationTargetFailure(context.recoveryCapability.targetFailure, facts);
    }
    return recommendQualificationTimedTargetInterruption(context.recoveryCapability, facts);
  }
  return recommendIssfInterruption(interruption, lostTimeSeconds, targetRecovery);
}
