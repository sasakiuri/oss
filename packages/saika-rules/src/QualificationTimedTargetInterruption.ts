import type { QualificationTimedTargetRecoveryCapability } from './RulePack';

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
  nonNegativeInteger(facts.interruptionSeconds, 'interruptionSeconds');
  positiveInteger(facts.seriesShotLimit, 'seriesShotLimit');
  nonNegativeInteger(facts.recordedShots, 'recordedShots');
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

  // A full recorded shot count is sufficient evidence that there are no shots
  // left to complete, even if a Lane projection has not yet published its
  // SERIES_COMPLETE phase transition.
  if (facts.seriesComplete || facts.recordedShots === facts.seriesShotLimit) {
    return Object.freeze({
      type: 'QUALIFICATION_TIMED_TARGET',
      interruptionSeconds: facts.interruptionSeconds,
      stageId: facts.stageId,
      extraSighting,
      seriesRecovery: Object.freeze({
        treatment: 'KEEP_RECORDED_SERIES',
        shotsToFire: 0,
        execution: null,
      }),
      ruleReferences: Object.freeze(ruleReferences),
      explanation: extraSightingRequired
        ? 'Retain the completed series and allow one extra sighting series before continuing.'
        : 'Retain the completed and recorded series; no series recovery firing is suggested.',
    });
  }

  if (stageRule.seriesRecovery.treatment === 'ANNUL_AND_REPEAT') {
    return Object.freeze({
      type: 'QUALIFICATION_TIMED_TARGET',
      interruptionSeconds: facts.interruptionSeconds,
      stageId: facts.stageId,
      extraSighting,
      seriesRecovery: Object.freeze({
        treatment: 'ANNUL_AND_REPEAT',
        shotsToFire: facts.seriesShotLimit,
        execution: Object.freeze({ mode: 'SAME_TIMED_TARGET_PROGRAM' }),
      }),
      ruleReferences: Object.freeze(ruleReferences),
      explanation: extraSightingRequired
        ? 'Allow one extra sighting series, then annul and repeat the interrupted series.'
        : 'Annul and repeat the interrupted series; credit the repeated series.',
    });
  }

  const shotsToFire = facts.seriesShotLimit - facts.recordedShots;
  const completion = stageRule.seriesRecovery.completion;
  const execution =
    completion.mode === 'SECONDS_PER_SHOT'
      ? Object.freeze({
          mode: 'SECONDS_PER_SHOT' as const,
          secondsPerShot: completion.secondsPerShot,
          totalSeconds: completion.secondsPerShot * shotsToFire,
        })
      : Object.freeze({ mode: 'FIRST_EXPOSURE_OF_NEXT_SERIES' as const });
  return Object.freeze({
    type: 'QUALIFICATION_TIMED_TARGET',
    interruptionSeconds: facts.interruptionSeconds,
    stageId: facts.stageId,
    extraSighting,
    seriesRecovery: Object.freeze({
      treatment: 'COMPLETE_REMAINING_SHOTS',
      shotsToFire,
      execution,
    }),
    ruleReferences: Object.freeze(ruleReferences),
    explanation: extraSightingRequired
      ? `Allow one extra sighting series, then complete the ${shotsToFire} remaining shot(s).`
      : `Complete the ${shotsToFire} remaining shot(s) under the stage-specific procedure.`,
  });
}

function positiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
}

function nonNegativeInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`);
}
