// SPDX-License-Identifier: MIT
import type {
  CompetitionShootOffWindow,
  ICompetitionShootOffControl,
  OpenCompetitionShootOffWindowInput,
} from '@/main/modules/competition-shoot-off/domain/ICompetitionShootOffControl';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

const STORAGE_KEY = 'mqtt.competitionShootOffWindow';

export class LocalCompetitionShootOffControl implements ICompetitionShootOffControl {
  constructor(private readonly storage: ILocalStorage) {}

  open(input: OpenCompetitionShootOffWindowInput): CompetitionShootOffWindow {
    const current = this.getState();
    if (
      current?.competitionId === input.competitionId &&
      current.runId === input.runId &&
      current.iteration === input.iteration
    ) {
      // A Director retry uses the same logical round but a fresh synchronized
      // start time. Re-arm only Lanes that have not fired; an observed physical
      // shot remains immutable and can never be replaced by the retry.
      if (current.status === 'SHOT_RECORDED') return current;
    }
    const state: CompetitionShootOffWindow = {
      ...input,
      status: 'OPEN',
      shotId: null,
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
    return this.storage.get<CompetitionShootOffWindow>(STORAGE_KEY) ?? null;
  }

  canAcceptShot(competitionId: string, at: Date): boolean {
    const state = this.getState();
    if (!state || state.competitionId !== competitionId || state.status !== 'OPEN') return false;
    const start = Date.parse(state.timerStartAt);
    const end = start + state.timerDurationSeconds * 1_000;
    return at.getTime() >= start && at.getTime() <= end;
  }

  recordShot(competitionId: string, shotId: string, at: Date): CompetitionShootOffWindow {
    const state = this.getState();
    if (!state || !this.canAcceptShot(competitionId, at)) {
      throw new Error(`Competition ${competitionId} has no open shoot-off window`);
    }
    const updated: CompetitionShootOffWindow = { ...state, status: 'SHOT_RECORDED', shotId };
    this.storage.set(STORAGE_KEY, updated);
    return updated;
  }
}
