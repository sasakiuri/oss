import type { LaneControlState, MutablePatch } from './LaneControl';
import { DomainError, ErrorCatalog } from '@/shared/errors';
import { Timer } from './Timer';
import { Shot } from './Shot';

export function eliminate(_state: LaneControlState, rank: number): MutablePatch {
  if (rank < 1) {
    throw DomainError.from(ErrorCatalog.SHOOTOFF.INVALID_RANK);
  }
  return {
    eliminated: true,
    eliminationRank: rank,
  };
}

export function startShootoff(state: LaneControlState): MutablePatch {
  if (state.phase !== 'SERIES_COMPLETE') {
    throw new DomainError(ErrorCatalog.COMPETITION.INVALID_PHASE_TRANSITION, {
      messageOverride: 'Can only enter SHOOTOFF from SERIES_COMPLETE',
    });
  }
  const timer = Timer.create(50); // SHOOTOFF duration: 50 seconds
  return {
    phase: 'SHOOTOFF',
    timer,
    shootoffShots: [],
  };
}

export function addShootoffShot(state: LaneControlState, score: number): MutablePatch {
  if (state.phase !== 'SHOOTOFF') {
    throw new DomainError(ErrorCatalog.SHOT.CANNOT_EDIT_IN_PHASE, {
      messageOverride: 'Shootoff shots can only be added during SHOOTOFF',
    });
  }
  const nextShotNum = state.shootoffShots.length + 1;
  const shot = Shot.create(nextShotNum, score);
  return {
    shootoffShots: [...state.shootoffShots, shot],
  };
}

export function resolveShootoff(state: LaneControlState): MutablePatch {
  if (state.phase !== 'SHOOTOFF') {
    throw new DomainError(ErrorCatalog.COMPETITION.INVALID_PHASE_TRANSITION, {
      messageOverride: 'Can only resolve shootoff from SHOOTOFF phase',
    });
  }
  return {
    phase: 'SERIES_COMPLETE',
    timer: null,
  };
}
