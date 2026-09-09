import type { FinalRankingCheckpoint, RulePack } from '../RulePack';

import { validateNonNegativeInteger, validatePositiveInteger, validateText } from './primitives';

export function validateFinalRankingCheckpoints(pack: RulePack): void {
  const checkpoints = pack.capabilities.ranking.finalCheckpoints;
  if (!checkpoints) return;
  if (pack.round !== 'FINAL' || pack.capabilities.ranking.strategy !== 'FINAL_SCORE') {
    throw new Error('ranking.finalCheckpoints is only valid for Finals');
  }
  const ranks = new Set<number>();
  let previousShot = 0;
  for (const checkpoint of checkpoints) {
    validatePositiveInteger(checkpoint.afterMatchShot, 'ranking.finalCheckpoints.afterMatchShot');
    if (checkpoint.afterMatchShot > pack.capabilities.ranking.totalShots) {
      throw new Error('ranking.finalCheckpoints cannot exceed the course of fire');
    }
    if (checkpoint.afterMatchShot < previousShot) {
      throw new Error('ranking.finalCheckpoints must be ordered by match shot');
    }
    if (!Number.isInteger(checkpoint.rank) || checkpoint.rank < 2) {
      throw new Error('ranking.finalCheckpoints.rank must be an integer of at least two');
    }
    if (ranks.has(checkpoint.rank)) throw new Error('ranking.finalCheckpoints ranks must be unique');
    validateFinalTieResolution(pack, checkpoint);
    ranks.add(checkpoint.rank);
    previousShot = checkpoint.afterMatchShot;
  }
}

function validateFinalTieResolution(pack: RulePack, checkpoint: FinalRankingCheckpoint): void {
  const resolution = checkpoint.tieResolution;
  if (!resolution || resolution.type === 'SHOOT_OFF' || resolution.type === 'FINAL_START_NUMBER') return;
  if (!Number.isInteger(resolution.athleteCount) || resolution.athleteCount < 2) {
    throw new Error('Final countback athleteCount must be an integer of at least two');
  }
  if (resolution.criteria.length === 0) throw new Error('Final countback criteria must not be empty');
  for (const criterion of resolution.criteria) {
    validateText(criterion.stageId, 'Final countback stageId');
    if (!Number.isInteger(criterion.seriesIndex) || criterion.seriesIndex < 0) {
      throw new Error('Final countback seriesIndex must be a non-negative integer');
    }
    const stage = pack.capabilities.courseOfFire.stages.find((candidate) => candidate.id === criterion.stageId);
    if (!stage?.series[criterion.seriesIndex] || stage.phase !== 'MATCH') {
      throw new Error(`Final countback references unavailable series ${criterion.stageId}/${criterion.seriesIndex}`);
    }
  }
}

export function validateShotResultProjection(pack: RulePack): void {
  const projection = pack.capabilities.resultProjection;
  if (!projection) return;
  if (pack.capabilities.scoring.mode !== 'DECIMAL' || pack.capabilities.scoring.precision !== 1) {
    throw new Error('HIT_MISS result projection requires DECIMAL source scoring');
  }
  validateNonNegativeInteger(projection.hitThresholdX10, 'resultProjection.hitThresholdX10');
  if (projection.hitThresholdX10 > 109) {
    throw new Error('resultProjection.hitThresholdX10 must not exceed 109');
  }
  if (projection.hitValueX10 !== 10 || projection.missValueX10 !== 0) {
    throw new Error('HIT_MISS result projection must score one point per hit and zero per miss');
  }
  validateText(projection.ruleReference, 'resultProjection.ruleReference');
}
