import { STUDY_DAYS_KEPT, type DateKey } from './schemas/study-log';

export type { DateKey, StudyLog } from './schemas/study-log';

/**
 * The study record shared by the Labs study tools: which days something was studied, and the day
 * of the exam. Everything here works on day names, so a test never depends on the clock or the
 * time zone of the machine it runs on; only `dateKey` reads a real date, in the reader's own zone.
 */

const pad = (value: number) => String(value).padStart(2, '0');

/** The reader's local calendar day for a moment. */
export function dateKey(date: Date): DateKey {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const toUtc = (key: DateKey) => {
  const [year, month, day] = key.split('-').map(Number) as [number, number, number];
  return Date.UTC(year, month - 1, day);
};

const DAY = 86_400_000;

/** The day `offset` days after `key` (before it for a negative offset). */
export function addDays(key: DateKey, offset: number): DateKey {
  const date = new Date(toUtc(key) + offset * DAY);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** Whole days from `from` to `to`: 1 for tomorrow, 0 for the same day, negative for the past. */
export function daysBetween(from: DateKey, to: DateKey): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY);
}

/** The days with `today` added, oldest first, keeping only the most recent ones. */
export function recordStudyDay(days: readonly DateKey[], today: DateKey): DateKey[] {
  if (days.includes(today)) return [...days];
  return [...days, today].sort().slice(-STUDY_DAYS_KEPT);
}

/** The length of the run of consecutive days that ends on `end`. */
function runEndingOn(days: ReadonlySet<DateKey>, end: DateKey): number {
  let length = 0;
  while (days.has(addDays(end, -length))) length += 1;
  return length;
}

/**
 * The current streak. A day not yet studied does not break it: until today is over, the run that
 * ended yesterday is still alive, and a reader opening the page in the morning should see it.
 */
export function currentStreak(days: readonly DateKey[], today: DateKey): number {
  const set = new Set(days);
  if (set.has(today)) return runEndingOn(set, today);
  return runEndingOn(set, addDays(today, -1));
}

/** The longest run of consecutive study days on record. */
export function longestStreak(days: readonly DateKey[]): number {
  const set = new Set(days);
  let longest = 0;
  // Counted forwards from the first day of each run.
  for (const day of set) {
    if (set.has(addDays(day, -1))) continue;
    let length = 1;
    while (set.has(addDays(day, length))) length += 1;
    longest = Math.max(longest, length);
  }
  return longest;
}

/**
 * A generator of numbers in [0, 1) fixed by a text seed (FNV-1a, then mulberry32). The same seed
 * gives the same sequence in every browser, which is what makes a set of questions "today's":
 * everyone who opens it on the same day, and the same reader after a reload, is asked the same.
 */
export function seededRandom(seed: string): () => number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  let state = hash >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}
