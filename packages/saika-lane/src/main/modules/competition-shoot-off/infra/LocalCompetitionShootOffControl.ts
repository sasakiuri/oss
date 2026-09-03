// SPDX-License-Identifier: MIT
import type {
  CompetitionShootOffWindow,
  ICompetitionShootOffControl,
  OpenCompetitionShootOffWindowInput,
} from '@/main/modules/competition-shoot-off/domain/ICompetitionShootOffControl';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

const STORAGE_KEY = 'mqtt.competitionShootOffWindow';

interface LegacyCompetitionShootOffWindow {
  readonly competitionId: string;
  readonly runId: string;
  readonly iteration: number;
  readonly timerStartAt: string;
  readonly timerDurationSeconds: number;
  readonly status: 'OPEN' | 'SHOT_RECORDED';
  readonly shotId: string | null;
}

export class LocalCompetitionShootOffControl implements ICompetitionShootOffControl {
  constructor(private readonly storage: ILocalStorage) {}

  open(input: OpenCompetitionShootOffWindowInput): CompetitionShootOffWindow {
    if (!Number.isInteger(input.shotsPerLane) || input.shotsPerLane <= 0) {
      throw new Error('Shoot-off shotsPerLane must be a positive integer');
    }
    const current = this.getState();
    if (
      current?.competitionId === input.competitionId &&
      current.runId === input.runId &&
      current.iteration === input.iteration
    ) {
      // A Director retry uses the same logical round but a fresh synchronized
      // start time. Completed observations remain immutable; a partial series
      // may continue only with the originally authorized shot count.
      if (current.status === 'COMPLETE') return current;
      if (current.recordedShotIds.length > 0 && current.shotsPerLane !== input.shotsPerLane) {
        throw new Error('Cannot change the shoot-off shot count after a shot has been recorded');
      }
      if (current.recordedShotIds.length > 0 && current.timedTargetProgramId !== input.timedTargetProgramId) {
        throw new Error('Cannot change the shoot-off timed-target program after a shot has been recorded');
      }
    }
    const state: CompetitionShootOffWindow = {
      ...input,
      status: 'OPEN',
      recordedShotIds:
        current?.competitionId === input.competitionId &&
        current.runId === input.runId &&
        current.iteration === input.iteration
          ? [...current.recordedShotIds]
          : [],
    };
    this.storage.set(STORAGE_KEY, state);
    return state;
  }

  close(competitionId: string, runId: string, iteration: number): void {
    const current = this.getState();
    if (
      current &&
      (current.competitionId !== competitionId || current.runId !== runId || current.iteration !== iteration)
    ) {
      throw new Error('The shoot-off close command does not match the active window');
    }
    this.storage.delete(STORAGE_KEY);
  }

  getState(): CompetitionShootOffWindow | null {
    const stored = this.storage.get<CompetitionShootOffWindow | LegacyCompetitionShootOffWindow>(STORAGE_KEY);
    if (!stored) return null;
    if ('shotsPerLane' in stored) return stored;
    const recordedShotIds = stored.shotId ? [stored.shotId] : [];
    return {
      competitionId: stored.competitionId,
      runId: stored.runId,
      iteration: stored.iteration,
      timerStartAt: stored.timerStartAt,
      timerDurationSeconds: stored.timerDurationSeconds,
      shotsPerLane: 1,
      status: recordedShotIds.length === 1 ? 'COMPLETE' : 'OPEN',
      recordedShotIds,
    };
  }

  canAcceptShot(competitionId: string, at: Date): boolean {
    const state = this.getState();
    if (
      !state ||
      state.competitionId !== competitionId ||
      state.status !== 'OPEN' ||
      state.recordedShotIds.length >= state.shotsPerLane
    )
      return false;
    const start = Date.parse(state.timerStartAt);
    const end = start + state.timerDurationSeconds * 1_000;
    return at.getTime() >= start && at.getTime() <= end;
  }

  recordShot(competitionId: string, shotId: string, at: Date): CompetitionShootOffWindow {
    const state = this.getState();
    if (state?.competitionId === competitionId && state.recordedShotIds.includes(shotId)) return state;
    if (!state || !this.canAcceptShot(competitionId, at)) {
      throw new Error(`Competition ${competitionId} has no open shoot-off window`);
    }
    const recordedShotIds = [...state.recordedShotIds, shotId];
    const updated: CompetitionShootOffWindow = {
      ...state,
      status: recordedShotIds.length >= state.shotsPerLane ? 'COMPLETE' : 'OPEN',
      recordedShotIds,
    };
    this.storage.set(STORAGE_KEY, updated);
    return updated;
  }
}
