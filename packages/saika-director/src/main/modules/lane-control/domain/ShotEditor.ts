import type { LaneControlState, MutablePatch } from './LaneControl';
import { DomainError, ErrorCatalog } from '@/shared/errors';
import { Shot } from './Shot';

const EDITABLE_PHASES = new Set<string>(['ACTIVE', 'SERIES_COMPLETE', 'SHOT_COMPLETE', 'FINISHED']);

function assertEditable(state: LaneControlState): void {
  if (!EDITABLE_PHASES.has(state.phase)) {
    throw DomainError.from(ErrorCatalog.SHOT.CANNOT_EDIT_IN_PHASE);
  }
}

export function updateShot(
  state: LaneControlState,
  shotIndex: number,
  newScore: number,
  shotType: 'PREPARATION' | 'MATCH',
): MutablePatch {
  assertEditable(state);
  if (shotType === 'PREPARATION') {
    if (shotIndex < 0 || shotIndex >= state.preparationShots.length) {
      throw DomainError.from(ErrorCatalog.SHOT.INDEX_OUT_OF_RANGE);
    }
    const updated = state.preparationShots.map((s, i) => (i === shotIndex ? s.withScore(newScore) : s));
    return { preparationShots: updated };
  }

  // MATCH
  if (shotIndex < 0 || shotIndex >= state.matchShots.length) {
    throw DomainError.from(ErrorCatalog.SHOT.INDEX_OUT_OF_RANGE);
  }
  const updated = state.matchShots.map((s, i) => (i === shotIndex ? s.withScore(newScore) : s));
  return { matchShots: updated };
}

export function removeShot(
  state: LaneControlState,
  shotIndex: number,
  shotType: 'PREPARATION' | 'MATCH',
): MutablePatch {
  assertEditable(state);
  const shots = shotType === 'PREPARATION' ? state.preparationShots : state.matchShots;
  if (shotIndex < 0 || shotIndex >= shots.length) {
    throw DomainError.from(ErrorCatalog.SHOT.INDEX_OUT_OF_RANGE);
  }
  const updated = shots.filter((_, i) => i !== shotIndex).map((s, i) => s.withShotNumber(i + 1));

  if (shotType === 'PREPARATION') {
    return { preparationShots: updated };
  }
  return { matchShots: updated };
}

export function insertShot(
  state: LaneControlState,
  shotIndex: number,
  score: number,
  shotType: 'PREPARATION' | 'MATCH',
): MutablePatch {
  assertEditable(state);
  const shots = shotType === 'PREPARATION' ? state.preparationShots : state.matchShots;
  if (shotIndex < 0 || shotIndex > shots.length) {
    throw DomainError.from(ErrorCatalog.SHOT.INDEX_OUT_OF_RANGE);
  }
  const newShot = Shot.create(shotIndex + 1, score);
  const updated = [...shots.slice(0, shotIndex), newShot, ...shots.slice(shotIndex)].map((s, i) =>
    s.withShotNumber(i + 1),
  );

  if (shotType === 'PREPARATION') {
    return { preparationShots: updated };
  }
  return { matchShots: updated };
}
