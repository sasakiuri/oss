import type {
  QualificationTimedTargetRecoveryCapability,
  QualificationTimedTargetSeriesRecoveryRule,
} from './RulePack';
import { validateNonNegativeInteger, validatePositiveInteger } from './validation/primitives';

export interface QualificationTimedTargetInterruptionFacts {
  readonly stageId: string;
  readonly interruptionSeconds: number;
  readonly seriesShotLimit: number;
  readonly recordedShots: number;
  /** A completed and recorded series is retained even if an interruption follows it. */
  readonly seriesComplete: boolean;
}

export type QualificationTimedTargetSeriesRecoveryRecommendation =
  | {
      readonly treatment: 'KEEP_RECORDED_SERIES';
      readonly shotsToFire: 0;
      readonly execution: null;
    }
  | {
      readonly treatment: 'ANNUL_AND_REPEAT';
      readonly shotsToFire: number;
      readonly execution: {
        readonly mode: 'SAME_TIMED_TARGET_PROGRAM';
      };
    }
  | {
      readonly treatment: 'COMPLETE_REMAINING_SHOTS';
      readonly shotsToFire: number;
      readonly execution:
        | {
            readonly mode: 'SECONDS_PER_SHOT';
            readonly secondsPerShot: number;
            readonly totalSeconds: number;
          }
        | {
            readonly mode: 'FIRST_EXPOSURE_OF_NEXT_SERIES';
          };
    };

export interface QualificationTimedTargetInterruptionRecommendation {
  readonly type: 'QUALIFICATION_TIMED_TARGET';
  readonly interruptionSeconds: number;
  readonly stageId: string;
  readonly extraSighting: {
    readonly required: boolean;
    readonly shots: number;
  };
  readonly seriesRecovery: QualificationTimedTargetSeriesRecoveryRecommendation;
  readonly minimumPauseAfterSightingSeconds?: number;
  readonly ruleReferences: readonly string[];
  readonly explanation: string;
}

/**
 * Pure ISSF Qualification recommendation. It neither authorizes a recovery nor
 * changes a Lane series; applications must keep those responsibilities in
 * separate audit and execution boundaries.
 */
export function recommendQualificationTimedTargetInterruption(
  capability: QualificationTimedTargetRecoveryCapability,
  facts: QualificationTimedTargetInterruptionFacts,
): QualificationTimedTargetInterruptionRecommendation {
  validateNonNegativeInteger(facts.interruptionSeconds, 'interruptionSeconds');
  validatePositiveInteger(facts.seriesShotLimit, 'seriesShotLimit');
  validateNonNegativeInteger(facts.recordedShots, 'recordedShots');
  if (facts.recordedShots > facts.seriesShotLimit) {
    throw new Error('recordedShots must not exceed seriesShotLimit');
  }
  if (facts.seriesComplete && facts.recordedShots !== facts.seriesShotLimit) {
    throw new Error('A completed series must contain its full recorded shot count');
  }

  const stageRule = capability.interruption.stages.find((candidate) => candidate.stageId === facts.stageId);
  if (!stageRule) throw new Error(`No Qualification timed-target recovery rule exists for stage ${facts.stageId}`);

  const extraSightingRequired = facts.interruptionSeconds > capability.interruption.extraSightingWhenLongerThanSeconds;
  const extraSighting = {
    required: extraSightingRequired,
    shots: extraSightingRequired ? capability.interruption.extraSightingSeriesShots : 0,
  } as const;
  const ruleReferences = [
    ...(extraSightingRequired ? [capability.interruption.extraSightingRuleReference] : []),
    stageRule.ruleReference,
  ];

  const seriesRecovery = recommendSeriesRecovery(stageRule.seriesRecovery, facts.seriesShotLimit, facts.recordedShots);
  if (seriesRecovery.execution) Object.freeze(seriesRecovery.execution);
  return Object.freeze({
    type: 'QUALIFICATION_TIMED_TARGET',
    interruptionSeconds: facts.interruptionSeconds,
    stageId: facts.stageId,
    extraSighting,
    seriesRecovery: Object.freeze(seriesRecovery),
    ruleReferences: Object.freeze(ruleReferences),
    explanation: explainInterruptionRecovery(seriesRecovery, extraSightingRequired),
  });
}

function explainInterruptionRecovery(
  recovery: QualificationTimedTargetSeriesRecoveryRecommendation,
  extraSightingRequired: boolean,
): string {
  switch (recovery.treatment) {
    case 'KEEP_RECORDED_SERIES':
      return extraSightingRequired
        ? 'Retain the completed series and allow one extra sighting series before continuing.'
        : 'Retain the completed and recorded series; no series recovery firing is suggested.';
    case 'ANNUL_AND_REPEAT':
      return extraSightingRequired
        ? 'Allow one extra sighting series, then annul and repeat the interrupted series.'
        : 'Annul and repeat the interrupted series; credit the repeated series.';
    case 'COMPLETE_REMAINING_SHOTS':
      return extraSightingRequired
        ? `Allow one extra sighting series, then complete the ${recovery.shotsToFire} remaining shot(s).`
        : `Complete the ${recovery.shotsToFire} remaining shot(s) under the stage-specific procedure.`;
  }
}

/** Series treatment shared by interruption and target-failure recovery; the caller validates the counts. */
export function recommendSeriesRecovery(
  rule: QualificationTimedTargetSeriesRecoveryRule,
  seriesShotLimit: number,
  recordedShots: number,
): QualificationTimedTargetSeriesRecoveryRecommendation {
  // A full recorded shot count is sufficient evidence that there are no shots
  // left to complete, even if a Lane projection has not yet published its
  // SERIES_COMPLETE phase transition.
  const remaining = seriesShotLimit - recordedShots;
  if (remaining === 0) return { treatment: 'KEEP_RECORDED_SERIES', shotsToFire: 0, execution: null };
  if (rule.treatment === 'ANNUL_AND_REPEAT') {
    return {
      treatment: 'ANNUL_AND_REPEAT',
      shotsToFire: seriesShotLimit,
      execution: { mode: 'SAME_TIMED_TARGET_PROGRAM' },
    };
  }
  const completion = rule.completion;
  return {
    treatment: 'COMPLETE_REMAINING_SHOTS',
    shotsToFire: remaining,
    execution:
      completion.mode === 'SECONDS_PER_SHOT'
        ? {
            mode: 'SECONDS_PER_SHOT',
            secondsPerShot: completion.secondsPerShot,
            totalSeconds: completion.secondsPerShot * remaining,
          }
        : { mode: 'FIRST_EXPOSURE_OF_NEXT_SERIES' },
  };
}
