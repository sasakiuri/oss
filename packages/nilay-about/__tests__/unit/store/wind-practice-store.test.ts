import { beforeEach, describe, expect, it } from 'vitest';

import {
  initialWindPracticeSettings,
  storageKey,
  useWindPracticeStore,
} from '@/app/(standalone)/labs/wind-practice/_store';
import { useStorageStatus } from '@/lib/browser-storage';
import { MAX_PRACTICE_ATTEMPTS } from '@/lib/schemas/wind-practice';

describe('wind practice record', () => {
  beforeEach(() => {
    useWindPracticeStore.setState(useWindPracticeStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
  });

  it('keeps the settings and the answers across a fresh session', async () => {
    const store = useWindPracticeStore.getState();
    store.setSettings({ kind: 'hold', angleUnit: 'moa', maxDistance: 400 });
    store.record({ kind: 'hold', hour: 2, correct: false });
    const saved = window.localStorage.getItem(storageKey)!;
    useWindPracticeStore.setState(useWindPracticeStore.getInitialState(), true);
    window.localStorage.setItem(storageKey, saved);
    await useWindPracticeStore.persist.rehydrate();
    expect(useWindPracticeStore.getState()).toMatchObject({
      kind: 'hold',
      angleUnit: 'moa',
      maxDistance: 400,
      attempts: [{ kind: 'hold', hour: 2, correct: false }],
    });
  });

  it('keeps only the most recent answers', () => {
    const store = useWindPracticeStore.getState();
    for (let index = 0; index < MAX_PRACTICE_ATTEMPTS + 5; index += 1)
      store.record({ kind: 'value', hour: 3, correct: index >= 5 });
    const { attempts } = useWindPracticeStore.getState();
    expect(attempts).toHaveLength(MAX_PRACTICE_ATTEMPTS);
    expect(attempts.every((attempt) => attempt.correct)).toBe(true);
    useWindPracticeStore.getState().clearAttempts();
    expect(useWindPracticeStore.getState().attempts).toEqual([]);
  });

  it('discards a save with an hour off the clock, and says so', async () => {
    const settings = { ...initialWindPracticeSettings, attempts: [{ kind: 'value', hour: 13, correct: true }] };
    window.localStorage.setItem(storageKey, JSON.stringify({ state: { settings }, version: 0 }));
    await useWindPracticeStore.persist.rehydrate();
    expect(useWindPracticeStore.getState()).toMatchObject(initialWindPracticeSettings);
    expect(useStorageStatus.getState().discarded).toEqual([storageKey]);
  });
});
