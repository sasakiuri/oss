import type { RangeInterruptionCase } from './RangeInterruptionCase';
import type { TargetRecoveryAssessment } from './TargetRecoveryAssessment';

export type InterruptionRecommendationBasis =
  'MANUAL_REVIEW' | 'LOST_TIME' | 'LAST_FIVE_MINUTES' | 'SIGHTING_AND_FIVE_MINUTES' | 'TARGET_FAILURE_RECOVERY';

export interface IssfInterruptionRecommendation {
  type: 'MATCH_TIME';
  basis: InterruptionRecommendationBasis;
  lostTimeSeconds: number;
  baseRemainingSeconds: number;
  suggestedAdditionalSeconds: number;
  suggestedAuthorizedRemainingSeconds: number;
  unlimitedSightingShots: boolean;
  ruleReferences: string;
  explanation: string;
}

const THREE_MINUTES_SECONDS = 180;
const FIVE_MINUTES_SECONDS = 300;
const LAST_FIVE_MINUTES_BONUS_SECONDS = 60;
const SIGHTING_RECOVERY_SECONDS = 300;

/** Pure recommendation policy. It never grants time or changes a Lane timer. */
export function recommendIssfInterruption(
  interruption: RangeInterruptionCase,
  lostTimeSeconds: number,
  targetRecovery: TargetRecoveryAssessment | null = null,
): IssfInterruptionRecommendation {
  const base = interruption.remainingSecondsAtStart;
  const inLastFiveMinutes = base <= FIVE_MINUTES_SECONDS;

  if (interruption.cause === 'ALL_TARGET_FAILURE') {
    return recommendation({
      basis: 'TARGET_FAILURE_RECOVERY',
      lostTimeSeconds,
      base,
      additional: SIGHTING_RECOVERY_SECONDS,
      unlimitedSightingShots: true,
      ruleReferences: 'ISSF 6.10.9.1',
      explanation: 'Target-failure recovery recommends five additional minutes and unlimited sighting shots.',
    });
  }

  if (interruption.cause === 'SINGLE_TARGET_FAILURE') {
    return recommendSingleTargetRecovery(interruption, lostTimeSeconds, targetRecovery);
  }

  const exceedsThreeMinutes = lostTimeSeconds > THREE_MINUTES_SECONDS;
  const exceedsFiveMinutes = lostTimeSeconds > FIVE_MINUTES_SECONDS;
  if (interruption.cause === 'OTHER' || (!exceedsThreeMinutes && interruption.cause !== 'FIRING_POINT_MOVE')) {
    return recommendation({
      basis: 'MANUAL_REVIEW',
      lostTimeSeconds,
      base,
      additional: 0,
      unlimitedSightingShots: false,
      ruleReferences: 'ISSF 6.11.3',
      explanation: 'No automatic recommendation applies; the Jury or Range Officer must determine any remedy.',
    });
  }

  const lastFiveBonus = exceedsThreeMinutes && inLastFiveMinutes ? LAST_FIVE_MINUTES_BONUS_SECONDS : 0;
  const sightingRecovery = exceedsFiveMinutes || interruption.cause === 'FIRING_POINT_MOVE';
  const additional = lastFiveBonus + (sightingRecovery ? SIGHTING_RECOVERY_SECONDS : 0);

  return recommendation({
    basis: sightingRecovery ? 'SIGHTING_AND_FIVE_MINUTES' : inLastFiveMinutes ? 'LAST_FIVE_MINUTES' : 'LOST_TIME',
    lostTimeSeconds,
    base,
    additional,
    unlimitedSightingShots: sightingRecovery,
    ruleReferences: sightingRecovery ? 'ISSF 6.11.3.1-2' : 'ISSF 6.11.3.1',
    explanation: sightingRecovery
      ? 'The preserved remaining time is combined with the applicable extension, five additional minutes, and unlimited sighting shots.'
      : inLastFiveMinutes
        ? 'The interruption occurred in the last five minutes; one minute is added to the preserved remaining time.'
        : 'The Lane should resume with the remaining time captured when the interruption began.',
  });
}

function recommendSingleTargetRecovery(
  interruption: RangeInterruptionCase,
  lostTimeSeconds: number,
  targetRecovery: TargetRecoveryAssessment | null,
): IssfInterruptionRecommendation {
  const base = interruption.remainingSecondsAtStart;
  if (targetRecovery === null) {
    return recommendation({
      basis: 'MANUAL_REVIEW',
      lostTimeSeconds,
      base,
      additional: 0,
      unlimitedSightingShots: false,
      ruleReferences: 'ISSF 6.10.9.2',
      explanation:
        'Record whether the target was repaired within five minutes and whether the athlete moved to a reserve firing point before applying the target-failure remedy.',
    });
  }

  const repairElapsedSeconds =
    targetRecovery.repairCompletedAt === null
      ? null
      : Math.ceil((targetRecovery.repairCompletedAt.getTime() - interruption.startedAt.getTime()) / 1000);
  const repairExceededFiveMinutes = repairElapsedSeconds === null || repairElapsedSeconds > FIVE_MINUTES_SECONDS;
  if (repairExceededFiveMinutes && targetRecovery.movedToReserveFiringPoint) {
    return recommendation({
      basis: 'TARGET_FAILURE_RECOVERY',
      lostTimeSeconds,
      base,
      additional: SIGHTING_RECOVERY_SECONDS,
      unlimitedSightingShots: true,
      ruleReferences: 'ISSF 6.10.9.2',
      explanation:
        'The target was not repaired within five minutes and the athlete moved to a reserve firing point; five additional minutes and unlimited sighting shots are recommended.',
    });
  }

  return recommendation({
    basis: 'MANUAL_REVIEW',
    lostTimeSeconds,
    base,
    additional: 0,
    unlimitedSightingShots: false,
    ruleReferences: 'ISSF 6.10.9.2; ISSF 6.11.3',
    explanation: repairExceededFiveMinutes
      ? 'The target exceeded the five-minute repair threshold, but a move to a reserve firing point has not been recorded. The Jury must determine the remedy.'
      : 'The target was repaired within five minutes, so the automatic single-target five-minute recovery does not apply. Any remedy requires Jury review.',
  });
}

function recommendation(input: {
  basis: InterruptionRecommendationBasis;
  lostTimeSeconds: number;
  base: number;
  additional: number;
  unlimitedSightingShots: boolean;
  ruleReferences: string;
  explanation: string;
}): IssfInterruptionRecommendation {
  return {
    type: 'MATCH_TIME',
    basis: input.basis,
    lostTimeSeconds: input.lostTimeSeconds,
    baseRemainingSeconds: input.base,
    suggestedAdditionalSeconds: input.additional,
    suggestedAuthorizedRemainingSeconds: input.base + input.additional,
    unlimitedSightingShots: input.unlimitedSightingShots,
    ruleReferences: input.ruleReferences,
    explanation: input.explanation,
  };
}
