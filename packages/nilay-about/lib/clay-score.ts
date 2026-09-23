import {
  TARGETS_PER_ROUND,
  type ClayDiscipline,
  type ClayRoundRecord,
  type TargetResult,
} from '@/lib/schemas/clay-score';

export { TARGETS_PER_ROUND };
export type { ClayDiscipline, ClayRoundRecord, TargetResult };

export const CLAY_RULES_CHECKED_ON = '2026-09-23';

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

export interface StationTally {
  station: number;
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
}

function tallyStations(layout: readonly SheetTarget[], results: readonly (TargetResult | null)[]): StationTally[] {
  const byStation = new Map<number, StationTally>();
  for (const target of layout) {
    const row = byStation.get(target.station) ?? { station: target.station, hits: 0, recorded: 0, total: 0 };
    const result = results[target.index] ?? null;
    row.total += 1;
    if (result !== null) row.recorded += 1;
    if (result === 'hit') row.hits += 1;
    byStation.set(target.station, row);
  }
  return [...byStation.values()].sort((a, b) => a.station - b.station);
}

export function summarizeRound(
  discipline: ClayDiscipline,
  startStation: number,
  results: readonly (TargetResult | null)[],
): RoundSummary {
  const layout = sheetLayout(discipline, startStation);
  let hits = 0;
  let misses = 0;
  let run = 0;
  let longestRun = 0;
  let lastRecorded = -1;
  for (let index = 0; index < TARGETS_PER_ROUND; index++) {
    const result = results[index] ?? null;
    if (result === 'hit') {
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
  for (let index = lastRecorded; index >= 0 && results[index] === 'hit'; index--) currentRun += 1;
  const recorded = hits + misses;
  const nextIndex = results.findIndex((result) => result === null || result === undefined);
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
  };
}

export interface HistorySummary {
  rounds: number;
  hits: number;
  targets: number;
  /** Mean hits per round of 25; null with no rounds. */
  average: number | null;
  best: number | null;
  stations: StationTally[];
}

/** Totals over the saved rounds of one discipline. */
export function summarizeHistory(records: readonly ClayRoundRecord[], discipline: ClayDiscipline): HistorySummary {
  const rounds = records.filter((record) => record.discipline === discipline);
  const stations = new Map<number, StationTally>();
  let hits = 0;
  let best: number | null = null;
  for (const record of rounds) {
    const summary = summarizeRound(
      record.discipline,
      record.discipline === 'trap' ? record.startStation : 1,
      record.results,
    );
    hits += summary.hits;
    best = best === null ? summary.hits : Math.max(best, summary.hits);
    for (const row of summary.stations) {
      const total = stations.get(row.station) ?? { station: row.station, hits: 0, recorded: 0, total: 0 };
      total.hits += row.hits;
      total.recorded += row.recorded;
      total.total += row.total;
      stations.set(row.station, total);
    }
  }
  return {
    rounds: rounds.length,
    hits,
    targets: rounds.length * TARGETS_PER_ROUND,
    average: rounds.length > 0 ? hits / rounds.length : null,
    best,
    stations: [...stations.values()].sort((a, b) => a.station - b.station),
  };
}

export const emptySheet = (): (TargetResult | null)[] => Array.from({ length: TARGETS_PER_ROUND }, () => null);
