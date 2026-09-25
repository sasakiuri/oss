import {
  MAX_SQUAD,
  TARGETS_PER_ROUND,
  type ClayDiscipline,
  type ClayRoundRecord,
  type ClayTagKey,
  type ClayTags,
  type KeyAction,
  type KeyMap,
  type TargetResult,
  type TrapDirection,
} from '@/lib/schemas/clay-score';

export { MAX_SQUAD, TARGETS_PER_ROUND };
export type { ClayDiscipline, ClayRoundRecord, ClayTagKey, ClayTags, KeyAction, KeyMap, TargetResult, TrapDirection };

export const CLAY_RULES_CHECKED_ON = '2026-09-24';

/** The rule book every layout on this page is taken from. */
export const ISSF_RULE_BOOK = {
  name: 'ISSF Rule Book 2026 Edition (2025 Second Print 07/2026), effective 1 July 2026',
  url: 'https://www.issf-sports.org/rules',
} as const;

export type SkeetHouse = 'high' | 'low';
export type SkeetKind = 'single' | 'double';

/** One target on the sheet, in the order it is shot. */
export interface SheetTarget {
  /** 0-based position in the round. */
  index: number;
  station: number;
  /** Which stop on the way round the range: trap passes the five stations five times, skeet stops nine times. */
  group: number;
  /** Skeet only: the house the target comes from and whether it is thrown alone or as part of a double. */
  house?: SkeetHouse;
  kind?: SkeetKind;
}

const TRAP_STATIONS = 5;

/**
 * Trap: after each target the athlete moves one station to the right, from 5 back round to 1,
 * until 25 targets have been shot, five from each station (ISSF Rule 9.8.1.1 e, f). The station
 * an athlete starts from is their place in the squad, so it is an input rather than always 1.
 */
export function trapLayout(startStation: number): SheetTarget[] {
  return Array.from({ length: TARGETS_PER_ROUND }, (_, index) => ({
    index,
    station: ((startStation - 1 + index) % TRAP_STATIONS) + 1,
    group: Math.floor(index / TRAP_STATIONS),
  }));
}

type SkeetShot = readonly [SkeetKind, SkeetHouse];
const single = (house: SkeetHouse): SkeetShot[] => [['single', house]];
const double = (first: SkeetHouse, second: SkeetHouse): SkeetShot[] => [
  ['double', first],
  ['double', second],
];

/** ISSF Rule 9.9.2.2, Target Shooting Sequence for Qualification Rounds, row by row. */
export const SKEET_SEQUENCE: readonly { station: number; shots: readonly SkeetShot[] }[] = [
  { station: 1, shots: [...single('high'), ...double('high', 'low')] },
  { station: 2, shots: [...single('high'), ...double('high', 'low')] },
  { station: 3, shots: [...single('high'), ...double('high', 'low')] },
  { station: 4, shots: [...single('high'), ...single('low')] },
  { station: 5, shots: [...single('low'), ...double('low', 'high')] },
  { station: 6, shots: [...single('low'), ...double('low', 'high')] },
  { station: 7, shots: [...double('low', 'high')] },
  { station: 4, shots: [...double('high', 'low'), ...double('low', 'high')] },
  { station: 8, shots: [...single('high'), ...single('low')] },
];

export function skeetLayout(): SheetTarget[] {
  const targets: SheetTarget[] = [];
  SKEET_SEQUENCE.forEach(({ station, shots }, group) => {
    for (const [kind, house] of shots) targets.push({ index: targets.length, station, group, kind, house });
  });
  return targets;
}

export function sheetLayout(discipline: ClayDiscipline, startStation: number): SheetTarget[] {
  return discipline === 'trap' ? trapLayout(startStation) : skeetLayout();
}

/** Anything but a miss broke the target, whichever barrel did it and whether that was recorded. */
export const isHit = (result: TargetResult | null | undefined): boolean =>
  result === 'hit' || result === 'first' || result === 'second';

export interface StationTally {
  station: number;
  hits: number;
  recorded: number;
  total: number;
}

/** Trap hits split by the barrel that broke them, over targets whose barrel was recorded. */
export interface BarrelTally {
  first: number;
  second: number;
  misses: number;
  /** Targets recorded on sheets that say which barrel broke each one. */
  recorded: number;
}

export interface DirectionTally {
  direction: TrapDirection;
  hits: number;
  /** Targets with this direction recorded. */
  recorded: number;
}

export interface HouseTally {
  house: SkeetHouse;
  kind: SkeetKind;
  hits: number;
  recorded: number;
  total: number;
}

export interface RoundSummary {
  hits: number;
  misses: number;
  recorded: number;
  complete: boolean;
  /** Hits over the targets recorded so far; null before the first one. */
  hitRate: number | null;
  /** The longest unbroken run of hits in the order the targets are shot. */
  longestRun: number;
  /** Hits counted back from the latest target recorded, in shooting order. */
  currentRun: number;
  /** One row per station, in station order; skeet station 4 counts both of its stops. */
  stations: StationTally[];
  /** The first target not yet recorded, or null once the sheet is full. */
  nextIndex: number | null;
  barrels: BarrelTally;
  directions: DirectionTally[];
  /** Skeet only: high and low house, singles and doubles. Empty for trap. */
  houses: HouseTally[];
}

export const TRAP_DIRECTIONS: readonly TrapDirection[] = ['left', 'centre', 'right'];
const HOUSE_ORDER: readonly [SkeetHouse, SkeetKind][] = [
  ['high', 'single'],
  ['high', 'double'],
  ['low', 'single'],
  ['low', 'double'],
];

type Results = readonly (TargetResult | null)[];
type Directions = readonly (TrapDirection | null)[];

function tallyStations(layout: readonly SheetTarget[], results: Results): StationTally[] {
  const byStation = new Map<number, StationTally>();
  for (const target of layout) {
    const row = byStation.get(target.station) ?? { station: target.station, hits: 0, recorded: 0, total: 0 };
    const result = results[target.index] ?? null;
    row.total += 1;
    if (result !== null) row.recorded += 1;
    if (isHit(result)) row.hits += 1;
    byStation.set(target.station, row);
  }
  return [...byStation.values()].sort((a, b) => a.station - b.station);
}

/** Only a sheet that holds a `first` or `second`, or was kept with barrels on, says anything about barrels. */
function tallyBarrels(results: Results, barrels: boolean): BarrelTally {
  const tally: BarrelTally = { first: 0, second: 0, misses: 0, recorded: 0 };
  if (!barrels) return tally;
  for (const result of results) {
    if (result === 'first') tally.first += 1;
    else if (result === 'second') tally.second += 1;
    else if (result === 'miss') tally.misses += 1;
    else continue;
    tally.recorded += 1;
  }
  return tally;
}

function tallyDirections(results: Results, directions: Directions): DirectionTally[] {
  return TRAP_DIRECTIONS.map((direction) => {
    let hits = 0;
    let recorded = 0;
    results.forEach((result, index) => {
      if (result === null || directions[index] !== direction) return;
      recorded += 1;
      if (isHit(result)) hits += 1;
    });
    return { direction, hits, recorded };
  });
}

function tallyHouses(layout: readonly SheetTarget[], results: Results): HouseTally[] {
  return HOUSE_ORDER.map(([house, kind]) => {
    const row: HouseTally = { house, kind, hits: 0, recorded: 0, total: 0 };
    for (const target of layout) {
      if (target.house !== house || target.kind !== kind) continue;
      const result = results[target.index] ?? null;
      row.total += 1;
      if (result !== null) row.recorded += 1;
      if (isHit(result)) row.hits += 1;
    }
    return row;
  });
}

export interface SheetInput {
  discipline: ClayDiscipline;
  startStation: number;
  results: Results;
  /** Trap only; a skeet sheet has none. */
  directions?: Directions;
  /** Whether the trap hits on this sheet name the barrel. */
  barrels?: boolean;
}

export function summarizeRound({
  discipline,
  startStation,
  results,
  directions = [],
  barrels = false,
}: SheetInput): RoundSummary {
  const layout = sheetLayout(discipline, startStation);
  let hits = 0;
  let misses = 0;
  let run = 0;
  let longestRun = 0;
  let lastRecorded = -1;
  for (let index = 0; index < TARGETS_PER_ROUND; index++) {
    const result = results[index] ?? null;
    if (isHit(result)) {
      hits += 1;
      run += 1;
      longestRun = Math.max(longestRun, run);
    } else {
      // A target not yet recorded breaks a run as well: it cannot be counted as a hit.
      if (result === 'miss') misses += 1;
      run = 0;
    }
    if (result !== null) lastRecorded = index;
  }
  let currentRun = 0;
  for (let index = lastRecorded; index >= 0 && isHit(results[index]); index--) currentRun += 1;
  const recorded = hits + misses;
  const nextIndex = results.findIndex((result) => result === null || result === undefined);
  const trap = discipline === 'trap';
  return {
    hits,
    misses,
    recorded,
    complete: recorded === TARGETS_PER_ROUND,
    hitRate: recorded > 0 ? hits / recorded : null,
    longestRun,
    currentRun,
    stations: tallyStations(layout, results),
    nextIndex: nextIndex === -1 || nextIndex >= TARGETS_PER_ROUND ? null : nextIndex,
    barrels: tallyBarrels(results, trap && barrels),
    directions: trap ? tallyDirections(results, directions) : [],
    houses: trap ? [] : tallyHouses(layout, results),
  };
}

export const recordSheet = (record: ClayRoundRecord): SheetInput =>
  record.discipline === 'trap'
    ? {
        discipline: 'trap',
        startStation: record.startStation,
        results: record.results,
        directions: record.directions,
        barrels: record.barrels === true,
      }
    : { discipline: 'skeet', startStation: 1, results: record.results };

/** Which saved rounds to count: one discipline, and optionally one shooter and exact tags. */
export interface HistoryFilter {
  discipline: ClayDiscipline;
  /** Null counts every shooter; '' is the rounds shot alone. */
  shooter?: string | null;
  /** A tag left empty or missing does not narrow the rounds. */
  tags?: Partial<ClayTags>;
}

export function matchesFilter(record: ClayRoundRecord, filter: HistoryFilter): boolean {
  if (record.discipline !== filter.discipline) return false;
  if (filter.shooter !== undefined && filter.shooter !== null && (record.shooter ?? '') !== filter.shooter)
    return false;
  for (const [key, value] of Object.entries(filter.tags ?? {}) as [ClayTagKey, string | undefined][])
    if (value && record.tags?.[key] !== value) return false;
  return true;
}

export interface HistorySummary {
  rounds: number;
  hits: number;
  targets: number;
  /** Mean hits per round of 25; null with no rounds. */
  average: number | null;
  best: number | null;
  stations: StationTally[];
  barrels: BarrelTally;
  directions: DirectionTally[];
  houses: HouseTally[];
}

const addInto = <T extends { hits: number; recorded: number; total?: number }>(target: T, row: T) => {
  target.hits += row.hits;
  target.recorded += row.recorded;
  if (target.total !== undefined && row.total !== undefined) target.total += row.total;
};

/** Totals over the saved rounds that pass the filter. */
export function summarizeHistory(records: readonly ClayRoundRecord[], filter: HistoryFilter): HistorySummary {
  const rounds = records.filter((record) => matchesFilter(record, filter));
  const stations = new Map<number, StationTally>();
  const barrels: BarrelTally = { first: 0, second: 0, misses: 0, recorded: 0 };
  const directions = TRAP_DIRECTIONS.map((direction) => ({ direction, hits: 0, recorded: 0 }));
  const houses = HOUSE_ORDER.map(([house, kind]) => ({ house, kind, hits: 0, recorded: 0, total: 0 }));
  let hits = 0;
  let best: number | null = null;
  for (const record of rounds) {
    const summary = summarizeRound(recordSheet(record));
    hits += summary.hits;
    best = best === null ? summary.hits : Math.max(best, summary.hits);
    for (const row of summary.stations) {
      const total = stations.get(row.station) ?? { station: row.station, hits: 0, recorded: 0, total: 0 };
      addInto(total, row);
      stations.set(row.station, total);
    }
    barrels.first += summary.barrels.first;
    barrels.second += summary.barrels.second;
    barrels.misses += summary.barrels.misses;
    barrels.recorded += summary.barrels.recorded;
    summary.directions.forEach((row, index) => addInto(directions[index]!, row));
    summary.houses.forEach((row, index) => addInto(houses[index]!, row));
  }
  const trap = filter.discipline === 'trap';
  return {
    rounds: rounds.length,
    hits,
    targets: rounds.length * TARGETS_PER_ROUND,
    average: rounds.length > 0 ? hits / rounds.length : null,
    best,
    stations: [...stations.values()].sort((a, b) => a.station - b.station),
    barrels,
    directions: trap ? directions : [],
    houses: trap ? [] : houses,
  };
}

/** First-barrel hits over the targets whose barrel was recorded. */
export const firstBarrelRate = (tally: BarrelTally): number | null =>
  tally.recorded > 0 ? tally.first / tally.recorded : null;

export interface TrendPoint {
  id: string;
  savedAt: string;
  hits: number;
}

/** The filtered rounds oldest first, one point per round, for the chart of scores over time. */
export function scoreTrend(records: readonly ClayRoundRecord[], filter: HistoryFilter): TrendPoint[] {
  return records
    .filter((record) => matchesFilter(record, filter))
    .map((record) => ({
      id: record.id,
      savedAt: record.savedAt,
      hits: summarizeRound(recordSheet(record)).hits,
    }))
    .sort((a, b) => a.savedAt.localeCompare(b.savedAt));
}

export interface SessionSummary {
  /** Null for a round saved without a session, which stands alone. */
  sessionId: string | null;
  /** Unique among the groups: the session id, or the round's own id when it has no session. */
  key: string;
  /** The first and last round saved in it. */
  startedAt: string;
  endedAt: string;
  rounds: number;
  hits: number;
  targets: number;
  records: ClayRoundRecord[];
}

/**
 * The saved rounds grouped by session, newest session first. A squad saves one record per shooter,
 * so a session of four squad rounds holds four rounds per shooter; `rounds` counts records.
 */
export function groupSessions(records: readonly ClayRoundRecord[]): SessionSummary[] {
  const sessions = new Map<string, SessionSummary>();
  for (const record of records) {
    const hits = summarizeRound(recordSheet(record)).hits;
    const key = record.sessionId ?? `round:${record.id}`;
    const session = sessions.get(key) ?? {
      sessionId: record.sessionId ?? null,
      key,
      startedAt: record.savedAt,
      endedAt: record.savedAt,
      rounds: 0,
      hits: 0,
      targets: 0,
      records: [],
    };
    session.rounds += 1;
    session.hits += hits;
    session.targets += TARGETS_PER_ROUND;
    if (record.savedAt < session.startedAt) session.startedAt = record.savedAt;
    if (record.savedAt > session.endedAt) session.endedAt = record.savedAt;
    session.records.push(record);
    sessions.set(key, session);
  }
  return [...sessions.values()].sort((a, b) => b.endedAt.localeCompare(a.endedAt));
}

/** The distinct values a tag has taken in the saved rounds, for the filter and for suggestions. */
export function tagValues(records: readonly ClayRoundRecord[], key: ClayTagKey): string[] {
  return [...new Set(records.map((record) => record.tags?.[key] ?? '').filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}

export function shooterNames(records: readonly ClayRoundRecord[]): string[] {
  return [...new Set(records.map((record) => record.shooter ?? ''))].sort((a, b) => a.localeCompare(b));
}

/** One shooter's turn at one target. */
export interface Turn {
  shooter: number;
  index: number;
}

/**
 * The order a squad shoots in.
 *
 * Trap: each athlete shoots one target and the next athlete follows, so the squad passes target by
 * target (ISSF Rule 9.8.1.1 b, e). Skeet: each athlete shoots the whole sequence of a station before
 * the next one steps up, and the squad moves on together (Rule 9.9.1.1 d to f).
 */
export function shootingOrder(discipline: ClayDiscipline, shooters: number): Turn[] {
  const count = Math.max(1, Math.min(MAX_SQUAD, Math.floor(shooters)));
  const turns: Turn[] = [];
  if (discipline === 'trap') {
    for (let index = 0; index < TARGETS_PER_ROUND; index++)
      for (let shooter = 0; shooter < count; shooter++) turns.push({ shooter, index });
    return turns;
  }
  for (const { group } of SKEET_SEQUENCE.map((row, group) => ({ ...row, group }))) {
    const indexes = skeetLayout()
      .filter((target) => target.group === group)
      .map((target) => target.index);
    for (let shooter = 0; shooter < count; shooter++) for (const index of indexes) turns.push({ shooter, index });
  }
  return turns;
}

/** The first turn in shooting order whose target is not recorded yet, or null once every sheet is full. */
export function nextTurn(discipline: ClayDiscipline, sheets: readonly Results[]): Turn | null {
  return (
    shootingOrder(discipline, sheets.length).find(
      ({ shooter, index }) => (sheets[shooter]?.[index] ?? null) === null,
    ) ?? null
  );
}

/** The latest turn in shooting order that has a result, which an undo clears. */
export function lastTurn(discipline: ClayDiscipline, sheets: readonly Results[]): Turn | null {
  const turns = shootingOrder(discipline, sheets.length);
  for (let position = turns.length - 1; position >= 0; position--) {
    const turn = turns[position]!;
    if ((sheets[turn.shooter]?.[turn.index] ?? null) !== null) return turn;
  }
  return null;
}

/**
 * Where each member of a squad starts on the trap line: the first five on stations 1 to 5, the sixth
 * behind station 1, moving on to it after the first athlete has shot (ISSF Rule 9.8.1).
 */
export const squadStartStation = (position: number): number => (position % 5) + 1;

/** Number keys for the results and the arrow keys for the direction, all of which the reader can change. */
export const DEFAULT_KEY_MAP: KeyMap = {
  first: '1',
  second: '2',
  miss: '0',
  undo: 'Backspace',
  left: 'ArrowLeft',
  centre: 'ArrowUp',
  right: 'ArrowRight',
};

/** The action a key is assigned to, or null. A key assigned twice goes to the first action listed. */
export function actionForKey(keyMap: KeyMap, key: string): KeyAction | null {
  const entry = (Object.entries(keyMap) as [KeyAction, string | null][]).find(([, assigned]) => assigned === key);
  return entry ? entry[0] : null;
}

export const emptySheet = (): (TargetResult | null)[] => Array.from({ length: TARGETS_PER_ROUND }, () => null);
export const emptyDirections = (): (TrapDirection | null)[] => Array.from({ length: TARGETS_PER_ROUND }, () => null);
