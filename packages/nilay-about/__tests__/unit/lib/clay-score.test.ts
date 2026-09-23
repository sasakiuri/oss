import { describe, expect, it } from 'vitest';

import {
  TARGETS_PER_ROUND,
  emptySheet,
  sheetLayout,
  skeetLayout,
  summarizeHistory,
  summarizeRound,
  trapLayout,
  type ClayRoundRecord,
  type TargetResult,
} from '@/lib/clay-score';
import { clayRoundRecordSchema } from '@/lib/schemas/clay-score';

const sheet = (fill: (index: number) => TargetResult | null) =>
  Array.from({ length: TARGETS_PER_ROUND }, (_, index) => fill(index));
const allHit = sheet(() => 'hit');

describe('trap layout (ISSF 9.8.1.1 e, f)', () => {
  it('moves one station right after each target and wraps from 5 to 1', () => {
    expect(trapLayout(1).map((target) => target.station)).toEqual(
      Array.from({ length: 25 }, (_, index) => (index % 5) + 1),
    );
    expect(
      trapLayout(3)
        .slice(0, 6)
        .map((target) => target.station),
    ).toEqual([3, 4, 5, 1, 2, 3]);
    expect(trapLayout(5)[1]!.station).toBe(1);
  });

  it('shoots five targets from each station, in five passes', () => {
    for (const start of [1, 2, 3, 4, 5]) {
      const layout = trapLayout(start);
      expect(layout).toHaveLength(25);
      for (const station of [1, 2, 3, 4, 5])
        expect(layout.filter((target) => target.station === station)).toHaveLength(5);
      expect(layout[4]!.group).toBe(0);
      expect(layout[5]!.group).toBe(1);
      expect(layout[24]!.group).toBe(4);
    }
  });
});

describe('skeet layout (ISSF 9.9.2.2)', () => {
  const layout = skeetLayout();

  it('follows the qualification sequence station by station', () => {
    expect(layout).toHaveLength(25);
    expect(layout.map((target) => target.station)).toEqual([
      1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 5, 5, 5, 6, 6, 6, 7, 7, 4, 4, 4, 4, 8, 8,
    ]);
    // Station 1: single high, then a double high - low.
    expect(layout.slice(0, 3).map(({ kind, house }) => [kind, house])).toEqual([
      ['single', 'high'],
      ['double', 'high'],
      ['double', 'low'],
    ]);
    // Station 5: single low, then a double low - high.
    expect(layout.slice(11, 14).map(({ kind, house }) => [kind, house])).toEqual([
      ['single', 'low'],
      ['double', 'low'],
      ['double', 'high'],
    ]);
    // The second stop at station 4: double high - low, then double low - high.
    expect(layout.slice(19, 23).map(({ kind, house }) => [kind, house])).toEqual([
      ['double', 'high'],
      ['double', 'low'],
      ['double', 'low'],
      ['double', 'high'],
    ]);
    // Station 8: single high, then single low.
    expect(layout.slice(23).map(({ kind, house }) => [kind, house])).toEqual([
      ['single', 'high'],
      ['single', 'low'],
    ]);
  });

  it('throws 9 singles and 8 doubles, 13 from the high house and 12 from the low', () => {
    expect(layout.filter((target) => target.kind === 'single')).toHaveLength(9);
    expect(layout.filter((target) => target.kind === 'double')).toHaveLength(16);
    expect(layout.filter((target) => target.house === 'high')).toHaveLength(13);
    expect(layout.filter((target) => target.house === 'low')).toHaveLength(12);
    expect(new Set(layout.map((target) => target.group)).size).toBe(9);
  });

  it('ignores the starting station', () => {
    expect(sheetLayout('skeet', 4)).toEqual(layout);
  });
});

describe('summarizeRound', () => {
  it('reports an empty sheet with no rate and the first target next', () => {
    const summary = summarizeRound('trap', 1, emptySheet());
    expect(summary).toMatchObject({
      hits: 0,
      misses: 0,
      recorded: 0,
      complete: false,
      hitRate: null,
      longestRun: 0,
      currentRun: 0,
      nextIndex: 0,
    });
  });

  it('counts a straight 25', () => {
    const summary = summarizeRound('trap', 1, allHit);
    expect(summary).toMatchObject({ hits: 25, recorded: 25, complete: true, hitRate: 1, longestRun: 25 });
    expect(summary.currentRun).toBe(25);
    expect(summary.nextIndex).toBeNull();
  });

  it('breaks a run at a miss', () => {
    const summary = summarizeRound(
      'trap',
      1,
      sheet((index) => (index === 10 ? 'miss' : 'hit')),
    );
    expect(summary.hits).toBe(24);
    expect(summary.misses).toBe(1);
    expect(summary.hitRate).toBe(24 / 25);
    // Targets 12 to 25 are 14 in a row; targets 1 to 10 are 10.
    expect(summary.longestRun).toBe(14);
    expect(summary.currentRun).toBe(14);
  });

  it('breaks a run at a target not yet recorded, and points to the gap', () => {
    const summary = summarizeRound(
      'trap',
      1,
      sheet((index) => (index === 0 || index === 2 || index === 3 ? 'hit' : null)),
    );
    expect(summary.recorded).toBe(3);
    expect(summary.longestRun).toBe(2);
    expect(summary.currentRun).toBe(2);
    expect(summary.nextIndex).toBe(1);
  });

  it('ends the current run at the latest miss', () => {
    const summary = summarizeRound(
      'skeet',
      1,
      sheet((index) => (index < 5 ? 'hit' : index === 5 ? 'miss' : null)),
    );
    expect(summary.longestRun).toBe(5);
    expect(summary.currentRun).toBe(0);
    expect(summary.hitRate).toBe(5 / 6);
  });

  it('tallies trap by the station each target was shot from', () => {
    // Starting at station 3, targets 1 and 6 are both shot from station 3.
    const summary = summarizeRound(
      'trap',
      3,
      sheet((index) => (index === 0 || index === 5 ? 'miss' : 'hit')),
    );
    expect(summary.stations.map((row) => row.station)).toEqual([1, 2, 3, 4, 5]);
    expect(summary.stations.find((row) => row.station === 3)).toEqual({
      station: 3,
      hits: 3,
      recorded: 5,
      total: 5,
    });
    expect(summary.stations.find((row) => row.station === 1)?.hits).toBe(5);
  });

  it('tallies skeet station 4 over both of its stops', () => {
    const summary = summarizeRound(
      'skeet',
      1,
      sheet((index) => (index < 12 ? 'hit' : null)),
    );
    expect(summary.stations.map((row) => [row.station, row.total])).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
      [4, 6],
      [5, 3],
      [6, 3],
      [7, 2],
      [8, 2],
    ]);
    // Targets 1-12 reach both station 4 singles and the first target of station 5.
    expect(summary.stations.find((row) => row.station === 4)).toEqual({ station: 4, hits: 2, recorded: 2, total: 6 });
    expect(summary.stations.find((row) => row.station === 5)).toEqual({ station: 5, hits: 1, recorded: 1, total: 3 });
  });
});

describe('summarizeHistory', () => {
  const records: ClayRoundRecord[] = [
    {
      id: 'a',
      savedAt: '2026-09-20T01:00:00.000Z',
      discipline: 'trap',
      startStation: 1,
      results: allHit,
      note: '',
    } as ClayRoundRecord,
    {
      id: 'b',
      savedAt: '2026-09-21T01:00:00.000Z',
      discipline: 'trap',
      startStation: 2,
      // Targets 1-5 from station 2, 3, 4, 5, 1: all missed, one from each station.
      results: sheet((index) => (index < 5 ? 'miss' : 'hit')),
      note: '',
    } as ClayRoundRecord,
    {
      id: 'c',
      savedAt: '2026-09-22T01:00:00.000Z',
      discipline: 'skeet',
      results: allHit,
      note: '',
    } as ClayRoundRecord,
  ];

  it('averages the rounds of one discipline only', () => {
    const trap = summarizeHistory(records, 'trap');
    expect(trap).toMatchObject({ rounds: 2, hits: 45, targets: 50, average: 22.5, best: 25 });
    for (const row of trap.stations) expect(row).toMatchObject({ hits: 9, recorded: 10, total: 10 });
    expect(summarizeHistory(records, 'skeet')).toMatchObject({ rounds: 1, average: 25, best: 25 });
  });

  it('has no average or best without rounds', () => {
    expect(summarizeHistory([], 'trap')).toMatchObject({ rounds: 0, average: null, best: null, stations: [] });
  });
});

describe('clayRoundRecordSchema', () => {
  const base = { id: 'x', savedAt: '2026-09-23T00:00:00.000Z', results: allHit, note: '' };

  it('needs a starting station for trap only', () => {
    expect(clayRoundRecordSchema.safeParse({ ...base, discipline: 'trap', startStation: 5 }).success).toBe(true);
    expect(clayRoundRecordSchema.safeParse({ ...base, discipline: 'trap' }).success).toBe(false);
    expect(clayRoundRecordSchema.safeParse({ ...base, discipline: 'trap', startStation: 6 }).success).toBe(false);
    expect(clayRoundRecordSchema.safeParse({ ...base, discipline: 'skeet' }).success).toBe(true);
  });

  it('keeps only full rounds of 25', () => {
    expect(
      clayRoundRecordSchema.safeParse({ ...base, discipline: 'skeet', results: allHit.slice(0, 24) }).success,
    ).toBe(false);
    expect(
      clayRoundRecordSchema.safeParse({ ...base, discipline: 'skeet', results: [...allHit.slice(0, 24), null] })
        .success,
    ).toBe(false);
  });
});
