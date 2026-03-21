// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import { BR60S } from '@/main/modules/competition/domain/competitionTypes';
import { CompetitionRepositoryImpl } from '@/main/modules/competition/infra/CompetitionRepositoryImpl';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

function createMockStorage(): ILocalStorage {
  const store = new Map<string, unknown>();
  return {
    get: vi.fn((key: string) => store.get(key) ?? undefined) as ILocalStorage['get'],
    set: vi.fn((key: string, value: unknown) => {
      store.set(key, value);
    }),
    setMany: vi.fn((entries: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(entries)) {
        store.set(key, value);
      }
    }),
    has: vi.fn((key: string) => store.has(key)),
    delete: vi.fn((key: string) => {
      store.delete(key);
    }),
    getAll: vi.fn(() => Object.fromEntries(store)),
    clear: vi.fn(() => {
      store.clear();
    }),
  };
}

describe('CompetitionRepositoryImpl', () => {
  let storage: ILocalStorage;
  let repo: CompetitionRepositoryImpl;

  beforeEach(() => {
    storage = createMockStorage();
    repo = new CompetitionRepositoryImpl(storage);
  });

  describe('save()', () => {
    it('can save a CompetitionState', async () => {
      const state = CompetitionState.create('comp-1', 'session-1', BR60S.config);
      await repo.save(state);

      // CREATED state (non-FINISHED) → batch write with setMany
      expect(storage.setMany).toHaveBeenCalledTimes(1);
    });

    it('ACTIVE state sets data and active key together via setMany', async () => {
      const state = CompetitionState.create('comp-1', 'session-1', BR60S.config).startStage();
      await repo.save(state);

      // one write with setMany (data + active key)
      expect(storage.setMany).toHaveBeenCalledTimes(1);
      const entries = vi.mocked(storage.setMany).mock.calls[0]![0];
      expect(entries).toHaveProperty('competition:comp-1');
      expect(entries).toHaveProperty('competition:active', 'comp-1');
    });

    it('FINISHED state saves with set and deletes active key', async () => {
      const state = CompetitionState.create('comp-1', 'session-1', BR60S.config).finish();
      await repo.save(state);

      // FINISHED → set(data) + delete(active key)
      expect(storage.set).toHaveBeenCalledTimes(1);
      expect(storage.delete).toHaveBeenCalledWith('competition:active');
      expect(storage.setMany).not.toHaveBeenCalled();
    });
  });

  describe('findById()', () => {
    it('can restore a saved CompetitionState', async () => {
      const original = CompetitionState.create('comp-1', 'session-1', BR60S.config).startStage();
      await repo.save(original);

      const found = await repo.findById('comp-1');
      expect(found).not.toBeNull();
      expect(found!.id).toBe('comp-1');
      expect(found!.sessionId).toBe('session-1');
      expect(found!.phase).toBe('ACTIVE');
      expect(found!.timer.remainingSeconds).toBe(600);
    });

    it('returns null for non-existent ID', async () => {
      const found = await repo.findById('nonexistent');
      expect(found).toBeNull();
    });
  });

  describe('findBySessionId()', () => {
    it('can search by session ID', async () => {
      const state = CompetitionState.create('comp-1', 'session-1', BR60S.config);
      await repo.save(state);

      const found = await repo.findBySessionId('session-1');
      expect(found).not.toBeNull();
      expect(found!.id).toBe('comp-1');
    });

    it('returns null for non-existent session ID', async () => {
      const found = await repo.findBySessionId('nonexistent');
      expect(found).toBeNull();
    });
  });

  describe('findActive()', () => {
    it('can retrieve the active competition', async () => {
      const state = CompetitionState.create('comp-1', 'session-1', BR60S.config).startStage();
      await repo.save(state);

      const found = await repo.findActive();
      expect(found).not.toBeNull();
      expect(found!.id).toBe('comp-1');
    });

    it('returns null when no active competition exists', async () => {
      const found = await repo.findActive();
      expect(found).toBeNull();
    });
  });

  describe('delete()', () => {
    it('can delete a competition', async () => {
      const state = CompetitionState.create('comp-1', 'session-1', BR60S.config).startStage();
      await repo.save(state);

      await repo.delete('comp-1');

      const found = await repo.findById('comp-1');
      expect(found).toBeNull();
    });

    it('active key is also deleted', async () => {
      const state = CompetitionState.create('comp-1', 'session-1', BR60S.config).startStage();
      await repo.save(state);

      await repo.delete('comp-1');

      const active = await repo.findActive();
      expect(active).toBeNull();
    });
  });

  describe('serialize / deserialize', () => {
    it('timer state is correctly saved and restored', async () => {
      let state = CompetitionState.create('comp-1', 'session-1', BR60S.config).startStage();
      state = state.tickTimerBy(120); // 2 minutes elapsed
      await repo.save(state);

      const found = await repo.findById('comp-1');
      expect(found!.timer.remainingSeconds).toBe(480); // 600 - 120
      expect(found!.timer.totalSeconds).toBe(600);
    });

    it('stage and series information is correctly saved and restored', async () => {
      let state = CompetitionState.create('comp-1', 'session-1', BR60S.config);
      state = state.startStage().expireTimer();
      state = state.advanceToNextStage(); // match stage
      state = state.startNextSeries();
      state = state.recordShotInSeries();
      await repo.save(state);

      const found = await repo.findById('comp-1');
      expect(found!.currentStageIndex).toBe(1);
      expect(found!.currentSeriesIndex).toBe(0);
      expect(found!.seriesShotCount).toBe(1);
    });
  });
});
