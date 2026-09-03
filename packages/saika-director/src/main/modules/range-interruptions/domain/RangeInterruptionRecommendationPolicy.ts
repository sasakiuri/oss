import {
  recommendQualificationTimedTargetInterruption,
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
    return recommendQualificationTimedTargetInterruption(context.recoveryCapability, {
      stageId: context.stageId,
      interruptionSeconds: lostTimeSeconds,
      seriesShotLimit: context.seriesShotLimit,
      recordedShots: context.recordedShots,
      seriesComplete: context.seriesComplete,
    });
  }
  return recommendIssfInterruption(interruption, lostTimeSeconds, targetRecovery);
}
