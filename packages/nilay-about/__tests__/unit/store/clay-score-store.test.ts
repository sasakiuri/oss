import { beforeEach, describe, expect, it } from 'vitest';

import { storageKey, useClayScoreStore } from '@/app/(standalone)/labs/clay-score/_store';
import { useStorageStatus } from '@/lib/browser-storage';
import { groupSessions, summarizeHistory } from '@/lib/clay-score';

/** A round exactly as the score sheet saved it before barrels, directions, squads, tags and sessions. */
const earlierRound = (id: string, discipline: 'trap' | 'skeet') => ({
  id,
  savedAt: '2026-09-20T01:00:00.000Z',
  discipline,
  ...(discipline === 'trap' ? { startStation: 3 } : {}),
  results: Array.from({ length: 25 }, (_, index) => (index === 0 ? 'miss' : 'hit')),
  note: 'Range A',
});

/** The whole save as persist wrote it then: no version was declared, so it is 0. */
const earlierSave = (results: ('hit' | 'miss' | null)[]) =>
  JSON.stringify({
    state: {
      discipline: 'trap',
      startStation: 2,
      results,
      note: 'memo',
      records: [earlierRound('a', 'trap'), earlierRound('b', 'skeet')],
    },
    version: 0,
  });

describe('clay score store', () => {
  beforeEach(() => {
    useClayScoreStore.setState(useClayScoreStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
  });

  it('reads a save made before the added fields as it is, without a discard notice', async () => {
    window.localStorage.setItem(storageKey, earlierSave(Array.from({ length: 25 }, () => null)));
    await useClayScoreStore.persist.rehydrate();
    const state = useClayScoreStore.getState();
    expect(useStorageStatus.getState().discarded).toEqual([]);
    // The rounds are kept exactly: nothing is added for what they never recorded.
    expect(state.records[0]).toEqual(earlierRound('a', 'trap'));
    expect(state.records[1]).toEqual(earlierRound('b', 'skeet'));
    expect(state.records[0]).not.toHaveProperty('barrels');
    expect(state.records[0]).not.toHaveProperty('sessionId');
    expect(state.shooters).toHaveLength(1);
    expect(state.shooters[0]).toMatchObject({ startStation: 2, name: '' });
    expect(state.note).toBe('memo');
  });

  it('counts the earlier rounds as without barrels, directions or session', async () => {
    window.localStorage.setItem(storageKey, earlierSave(Array.from({ length: 25 }, () => null)));
    await useClayScoreStore.persist.rehydrate();
    const { records } = useClayScoreStore.getState();
    const history = summarizeHistory(records, { discipline: 'trap' });
    expect(history).toMatchObject({ rounds: 1, hits: 24 });
    expect(history.barrels.recorded).toBe(0);
    expect(history.directions.every((row) => row.recorded === 0)).toBe(true);
    // Rounds saved without a session each stand alone.
    expect(groupSessions(records).map((session) => [session.sessionId, session.rounds])).toEqual([
      [null, 1],
      [null, 1],
    ]);
    expect(summarizeHistory(records, { discipline: 'trap', tags: { range: 'X' } }).rounds).toBe(0);
  });

  it('goes on with an earlier sheet in progress as plain hit or miss', async () => {
    window.localStorage.setItem(
      storageKey,
      earlierSave(Array.from({ length: 25 }, (_, index) => (index < 3 ? 'hit' : null))),
    );
    await useClayScoreStore.persist.rehydrate();
    const state = useClayScoreStore.getState();
    expect(state.barrels).toBe(false);
    expect(state.shooters[0]!.results.slice(0, 4)).toEqual(['hit', 'hit', 'hit', null]);
    expect(state.mark('hit')).toMatchObject({ index: 3, result: 'hit' });
    expect(useStorageStatus.getState().discarded).toEqual([]);
  });

  it('writes back in a shape the same schema reads, with the squad kept apart', async () => {
    const store = useClayScoreStore.getState();
    store.setSquadSize(2);
    store.mark('first');
    const saved = JSON.parse(window.localStorage.getItem(storageKey) ?? '{}');
    expect(saved.state.results[0]).toBe('first');
    expect(saved.state.squad).toHaveLength(1);
    useClayScoreStore.setState(useClayScoreStore.getInitialState(), true);
    window.localStorage.setItem(storageKey, JSON.stringify(saved));
    await useClayScoreStore.persist.rehydrate();
    expect(useClayScoreStore.getState().shooters).toHaveLength(2);
    expect(useStorageStatus.getState().discarded).toEqual([]);
  });

  it('reports a save it cannot read instead of starting over silently', async () => {
    window.localStorage.setItem(storageKey, JSON.stringify({ state: { discipline: 'darts' }, version: 0 }));
    await useClayScoreStore.persist.rehydrate();
    expect(useStorageStatus.getState().discarded).toContain(storageKey);
    expect(useClayScoreStore.getState().records).toEqual([]);
  });

  it('refuses results the sheet does not hold', () => {
    const store = useClayScoreStore.getState();
    expect(store.mark('hit')).toBeNull();
    expect(store.mark('first')).toMatchObject({ shooter: 0, index: 0, result: 'first' });
    useClayScoreStore.getState().setDiscipline('skeet');
    expect(useClayScoreStore.getState().mark('second')).toBeNull();
    expect(useClayScoreStore.getState().mark('hit', 'left')).toMatchObject({ result: 'hit', direction: null });
  });

  it('frees a key taken by another action and restores a deleted session with undo', () => {
    useClayScoreStore.getState().setKey('miss', '1');
    expect(useClayScoreStore.getState().keyMap).toMatchObject({ first: null, miss: '1' });
    for (let round = 0; round < 2; round++) {
      for (let index = 0; index < 25; index++) useClayScoreStore.getState().mark('first');
      useClayScoreStore.getState().saveRound();
    }
    const ids = useClayScoreStore.getState().records.map((record) => record.id);
    useClayScoreStore.getState().deleteRecords(ids);
    expect(useClayScoreStore.getState().records).toEqual([]);
    useClayScoreStore.getState().undoDelete();
    expect(useClayScoreStore.getState().records.map((record) => record.id)).toEqual(ids);
  });
});
