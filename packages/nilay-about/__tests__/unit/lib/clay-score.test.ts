import { describe, expect, it } from 'vitest';

import {
  DEFAULT_KEY_MAP,
  TARGETS_PER_ROUND,
  actionForKey,
  emptyDirections,
  emptySheet,
  firstBarrelRate,
  groupSessions,
  lastTurn,
  recordSheet,
  nextTurn,
  scoreTrend,
  shootingOrder,
  squadStartStation,
  tagValues,
  sheetLayout,
  skeetLayout,
  summarizeHistory,
  summarizeRound,
  trapLayout,
  type ClayRoundRecord,
  type TargetResult,
  type TrapDirection,
} from '@/lib/clay-score';
import { clayRoundRecordSchema, emptyTags } from '@/lib/schemas/clay-score';

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
    const summary = summarizeRound({ discipline: 'trap', startStation: 1, results: emptySheet() });
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
    const summary = summarizeRound({ discipline: 'trap', startStation: 1, results: allHit });
    expect(summary).toMatchObject({ hits: 25, recorded: 25, complete: true, hitRate: 1, longestRun: 25 });
    expect(summary.currentRun).toBe(25);
    expect(summary.nextIndex).toBeNull();
  });

  it('breaks a run at a miss', () => {
    const summary = summarizeRound({
      discipline: 'trap',
      startStation: 1,
      results: sheet((index) => (index === 10 ? 'miss' : 'hit')),
    });
    expect(summary.hits).toBe(24);
    expect(summary.misses).toBe(1);
    expect(summary.hitRate).toBe(24 / 25);
    // Targets 12 to 25 are 14 in a row; targets 1 to 10 are 10.
    expect(summary.longestRun).toBe(14);
    expect(summary.currentRun).toBe(14);
  });

  it('breaks a run at a target not yet recorded, and points to the gap', () => {
    const summary = summarizeRound({
      discipline: 'trap',
      startStation: 1,
      results: sheet((index) => (index === 0 || index === 2 || index === 3 ? 'hit' : null)),
    });
    expect(summary.recorded).toBe(3);
    expect(summary.longestRun).toBe(2);
    expect(summary.currentRun).toBe(2);
    expect(summary.nextIndex).toBe(1);
  });

  it('ends the current run at the latest miss', () => {
    const summary = summarizeRound({
      discipline: 'skeet',
      startStation: 1,
      results: sheet((index) => (index < 5 ? 'hit' : index === 5 ? 'miss' : null)),
    });
    expect(summary.longestRun).toBe(5);
    expect(summary.currentRun).toBe(0);
    expect(summary.hitRate).toBe(5 / 6);
  });

  it('tallies trap by the station each target was shot from', () => {
    // Starting at station 3, targets 1 and 6 are both shot from station 3.
    const summary = summarizeRound({
      discipline: 'trap',
      startStation: 3,
      results: sheet((index) => (index === 0 || index === 5 ? 'miss' : 'hit')),
    });
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
    const summary = summarizeRound({
      discipline: 'skeet',
      startStation: 1,
      results: sheet((index) => (index < 12 ? 'hit' : null)),
    });
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

describe('barrels, directions and houses', () => {
  it('counts first and second barrel hits only on a sheet kept with barrels', () => {
    const results = sheet((index) => (index < 20 ? 'first' : index < 23 ? 'second' : 'miss'));
    const summary = summarizeRound({ discipline: 'trap', startStation: 1, results, barrels: true });
    expect(summary.hits).toBe(23);
    expect(summary.barrels).toEqual({ first: 20, second: 3, misses: 2, recorded: 25 });
    expect(firstBarrelRate(summary.barrels)).toBe(20 / 25);
    const plain = summarizeRound({ discipline: 'trap', startStation: 1, results: allHit, barrels: false });
    expect(plain.barrels.recorded).toBe(0);
    expect(firstBarrelRate(plain.barrels)).toBeNull();
  });

  it('tallies trap hits by the direction recorded, and leaves out targets without one', () => {
    const directions: (TrapDirection | null)[] = Array.from({ length: 25 }, (_, index) =>
      index < 10 ? 'left' : index < 15 ? 'centre' : index < 20 ? 'right' : null,
    );
    const results = sheet((index) => (index === 0 || index === 12 ? 'miss' : index < 22 ? 'hit' : null));
    const summary = summarizeRound({ discipline: 'trap', startStation: 1, results, directions });
    expect(summary.directions).toEqual([
      { direction: 'left', hits: 9, recorded: 10 },
      { direction: 'centre', hits: 4, recorded: 5 },
      { direction: 'right', hits: 5, recorded: 5 },
    ]);
    expect(summary.houses).toEqual([]);
  });

  it('tallies skeet by house and single or double', () => {
    const summary = summarizeRound({
      discipline: 'skeet',
      startStation: 1,
      // Target 2 is the high bird of the double at station 1.
      results: sheet((index) => (index === 1 ? 'miss' : 'hit')),
    });
    expect(summary.houses).toEqual([
      // Singles: high at 1, 2, 3, 4 and 8, low at 4, 5, 6 and 8. Doubles: eight from each house.
      { house: 'high', kind: 'single', hits: 5, recorded: 5, total: 5 },
      { house: 'high', kind: 'double', hits: 7, recorded: 8, total: 8 },
      { house: 'low', kind: 'single', hits: 4, recorded: 4, total: 4 },
      { house: 'low', kind: 'double', hits: 8, recorded: 8, total: 8 },
    ]);
    expect(summary.directions).toEqual([]);
  });
});

describe('squad order (ISSF 9.8.1.1, 9.9.1.1)', () => {
  it('passes trap target by target through the squad', () => {
    expect(shootingOrder('trap', 3).slice(0, 7)).toEqual([
      { shooter: 0, index: 0 },
      { shooter: 1, index: 0 },
      { shooter: 2, index: 0 },
      { shooter: 0, index: 1 },
      { shooter: 1, index: 1 },
      { shooter: 2, index: 1 },
      { shooter: 0, index: 2 },
    ]);
    expect(shootingOrder('trap', 6)).toHaveLength(150);
  });

  it('lets each skeet shooter finish a station before the next', () => {
    const order = shootingOrder('skeet', 2);
    expect(order.slice(0, 6)).toEqual([
      { shooter: 0, index: 0 },
      { shooter: 0, index: 1 },
      { shooter: 0, index: 2 },
      { shooter: 1, index: 0 },
      { shooter: 1, index: 1 },
      { shooter: 1, index: 2 },
    ]);
    expect(order).toHaveLength(50);
  });

  it('is the plain target order for one shooter', () => {
    expect(shootingOrder('skeet', 1).map((turn) => turn.index)).toEqual(Array.from({ length: 25 }, (_, i) => i));
  });

  it('finds the next and the last turn across the squad', () => {
    const first = sheet((index) => (index < 2 ? 'hit' : null));
    const second = sheet((index) => (index < 1 ? 'miss' : null));
    expect(nextTurn('trap', [first, second])).toEqual({ shooter: 1, index: 1 });
    expect(lastTurn('trap', [first, second])).toEqual({ shooter: 0, index: 1 });
    expect(nextTurn('trap', [allHit, allHit])).toBeNull();
    expect(lastTurn('trap', [emptySheet()])).toBeNull();
  });

  it('starts the sixth trap shooter at station 1 again', () => {
    expect([0, 1, 2, 3, 4, 5].map(squadStartStation)).toEqual([1, 2, 3, 4, 5, 1]);
  });
});

describe('key map', () => {
  it('maps assigned keys to actions and nothing else', () => {
    expect(actionForKey(DEFAULT_KEY_MAP, '1')).toBe('first');
    expect(actionForKey(DEFAULT_KEY_MAP, 'ArrowLeft')).toBe('left');
    expect(actionForKey(DEFAULT_KEY_MAP, 'x')).toBeNull();
    expect(actionForKey({ ...DEFAULT_KEY_MAP, miss: null }, '0')).toBeNull();
  });
});

const trapRecord = (
  id: string,
  savedAt: string,
  results: TargetResult[],
  extra: Partial<Extract<ClayRoundRecord, { discipline: 'trap' }>> = {},
): ClayRoundRecord => ({
  id,
  savedAt,
  discipline: 'trap',
  startStation: 1,
  barrels: false,
  results,
  directions: emptyDirections(),
  note: '',
  shooter: '',
  sessionId: 's1',
  tags: emptyTags(),
  ...extra,
});
const full = (fill: (index: number) => TargetResult) => sheet(fill) as TargetResult[];

describe('summarizeHistory', () => {
  const records: ClayRoundRecord[] = [
    trapRecord(
      'a',
      '2026-09-20T01:00:00.000Z',
      full(() => 'hit'),
    ),
    // Targets 1-5 from station 2, 3, 4, 5, 1: all missed, one from each station.
    trapRecord(
      'b',
      '2026-09-21T01:00:00.000Z',
      full((index) => (index < 5 ? 'miss' : 'hit')),
      { startStation: 2 },
    ),
    {
      id: 'c',
      savedAt: '2026-09-22T01:00:00.000Z',
      discipline: 'skeet',
      results: full(() => 'hit'),
      directions: emptyDirections(),
      note: '',
      shooter: '',
      sessionId: 's2',
      tags: emptyTags(),
    },
  ];

  it('averages the rounds of one discipline only', () => {
    const trap = summarizeHistory(records, { discipline: 'trap' });
    expect(trap).toMatchObject({ rounds: 2, hits: 45, targets: 50, average: 22.5, best: 25 });
    for (const row of trap.stations) expect(row).toMatchObject({ hits: 9, recorded: 10, total: 10 });
    expect(summarizeHistory(records, { discipline: 'skeet' })).toMatchObject({ rounds: 1, average: 25, best: 25 });
  });

  it('has no average or best without rounds', () => {
    expect(summarizeHistory([], { discipline: 'trap' })).toMatchObject({
      rounds: 0,
      average: null,
      best: null,
      stations: [],
    });
  });

  it('narrows by shooter and by tags, where an empty tag narrows nothing', () => {
    const tagged = [
      trapRecord(
        'd',
        '2026-09-23T01:00:00.000Z',
        full(() => 'hit'),
        {
          shooter: 'Aki',
          tags: { ...emptyTags(), gun: 'A', range: 'R' },
        },
      ),
      trapRecord(
        'e',
        '2026-09-23T02:00:00.000Z',
        full(() => 'miss'),
        {
          shooter: 'Ben',
          tags: { ...emptyTags(), gun: 'B', range: 'R' },
        },
      ),
    ];
    expect(summarizeHistory(tagged, { discipline: 'trap', shooter: 'Aki' }).rounds).toBe(1);
    expect(summarizeHistory(tagged, { discipline: 'trap', shooter: null, tags: { range: 'R' } }).rounds).toBe(2);
    expect(summarizeHistory(tagged, { discipline: 'trap', tags: { gun: 'B', range: '' } })).toMatchObject({
      rounds: 1,
      hits: 0,
    });
    expect(tagValues(tagged, 'gun')).toEqual(['A', 'B']);
    expect(tagValues(tagged, 'weather')).toEqual([]);
  });

  it('adds up the barrels of the sheets kept with them', () => {
    const withBarrels = trapRecord(
      'f',
      '2026-09-23T03:00:00.000Z',
      full((index) => (index < 15 ? 'first' : index < 20 ? 'second' : 'miss')),
      { barrels: true },
    );
    const history = summarizeHistory([...records, withBarrels], { discipline: 'trap' });
    expect(history.barrels).toEqual({ first: 15, second: 5, misses: 5, recorded: 25 });
  });

  it('lists the scores oldest first and groups sessions newest first', () => {
    expect(scoreTrend(records, { discipline: 'trap' }).map((point) => [point.id, point.hits])).toEqual([
      ['a', 25],
      ['b', 20],
    ]);
    const sessions = groupSessions(records);
    expect(sessions.map((session) => [session.sessionId, session.rounds, session.hits, session.targets])).toEqual([
      ['s2', 1, 25, 25],
      ['s1', 2, 45, 50],
    ]);
    expect(sessions[1]).toMatchObject({ startedAt: '2026-09-20T01:00:00.000Z', endedAt: '2026-09-21T01:00:00.000Z' });
  });
});

describe('clayRoundRecordSchema', () => {
  const base = {
    id: 'x',
    savedAt: '2026-09-23T00:00:00.000Z',
    results: allHit,
    directions: emptyDirections(),
    note: '',
    shooter: '',
    sessionId: 's',
    tags: emptyTags(),
  };

  it('needs a starting station and the barrel setting for trap only', () => {
    expect(
      clayRoundRecordSchema.safeParse({ ...base, discipline: 'trap', startStation: 5, barrels: false }).success,
    ).toBe(true);
    expect(clayRoundRecordSchema.safeParse({ ...base, discipline: 'trap', barrels: false }).success).toBe(false);
    expect(
      clayRoundRecordSchema.safeParse({ ...base, discipline: 'trap', startStation: 6, barrels: false }).success,
    ).toBe(false);
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

  it('holds barrel hits only on a trap sheet kept with barrels, and no directions on skeet', () => {
    const barrelHits = sheet(() => 'first');
    const trap = { ...base, discipline: 'trap', startStation: 1 };
    expect(clayRoundRecordSchema.safeParse({ ...trap, barrels: true, results: barrelHits }).success).toBe(true);
    expect(clayRoundRecordSchema.safeParse({ ...trap, barrels: true, results: allHit }).success).toBe(false);
    expect(clayRoundRecordSchema.safeParse({ ...trap, barrels: false, results: barrelHits }).success).toBe(false);
    expect(clayRoundRecordSchema.safeParse({ ...base, discipline: 'skeet', results: barrelHits }).success).toBe(false);
    expect(
      clayRoundRecordSchema.safeParse({
        ...base,
        discipline: 'skeet',
        directions: emptyDirections().map(() => 'left'),
      }).success,
    ).toBe(false);
  });
});

describe('rounds saved before the added fields', () => {
  it('pass the schema with only what they recorded, and count as without barrels', () => {
    const earlier = {
      id: 'old',
      savedAt: '2026-09-20T01:00:00.000Z',
      discipline: 'trap',
      startStation: 1,
      results: allHit,
      note: '',
    };
    const parsed = clayRoundRecordSchema.safeParse(earlier);
    expect(parsed.success).toBe(true);
    const round = parsed.success ? parsed.data : null;
    expect(round).toEqual(earlier);
    const summary = summarizeRound(recordSheet(round!));
    expect(summary.hits).toBe(25);
    expect(summary.barrels.recorded).toBe(0);
    // An earlier round cannot hold barrel results, since it never said it recorded them.
    expect(clayRoundRecordSchema.safeParse({ ...earlier, results: sheet(() => 'first') }).success).toBe(false);
    expect(clayRoundRecordSchema.safeParse({ ...earlier, discipline: 'skeet', startStation: undefined }).success).toBe(
      true,
    );
  });
});
