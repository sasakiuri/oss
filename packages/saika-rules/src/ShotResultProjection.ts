/**
 * Describes how a raw, device-independent shot score is converted into the
 * score used by a competition result. The source score remains available for
 * audit and adjudication.
 */
export interface HitMissResultProjectionCapability {
  readonly type: 'HIT_MISS';
  readonly source: 'EFFECTIVE_SCORE_X10';
  readonly hitThresholdX10: number;
  readonly hitValueX10: 10;
  readonly missValueX10: 0;
  readonly displayUnit: 'HITS';
  readonly preserveSourceScore: true;
  readonly ruleReference: string;
}
export type ShotResultProjectionCapability = HitMissResultProjectionCapability;

export interface ProjectedShotResult {
  readonly sourceScoreX10: number;
  readonly resultScoreX10: number;
  readonly classification: 'SCORE' | 'HIT' | 'MISS';
}

/**
 * Pure result projection shared by Lane and Director adapters. Keeping this
 * outside either application prevents target acquisition from depending on a
 * particular competition format.
 */
export function projectShotResult(
  capability: ShotResultProjectionCapability | undefined,
  sourceScoreX10: number,
): ProjectedShotResult {
  if (!Number.isInteger(sourceScoreX10) || sourceScoreX10 < 0 || sourceScoreX10 > 109) {
    throw new Error('sourceScoreX10 must be an integer between 0 and 109');
  }

  if (!capability) {
    return {
      sourceScoreX10,
      resultScoreX10: sourceScoreX10,
      classification: 'SCORE',
    };
  }

  const hit = sourceScoreX10 >= capability.hitThresholdX10;
  return {
    sourceScoreX10,
    resultScoreX10: hit ? capability.hitValueX10 : capability.missValueX10,
    classification: hit ? 'HIT' : 'MISS',
  };
}
