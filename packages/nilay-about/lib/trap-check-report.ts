import type { Trap, WorkSession } from '@/lib/schemas/trap-check-log';
import { formatLocalDateTime, getTrapStatus, parseLocalDateTime, type Language } from '@/lib/trap-check-log';

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

// ---------------------------------------------------------------------------------------------------
// Figures for each trap
// ---------------------------------------------------------------------------------------------------

export interface TrapStats {
  /** Days the trap has stood: from setting to removal, or to now while it is still set. */
  trapDays: number;
  rounds: number;
  /** Rounds that found a target animal, and the animals they counted. */
  catchRounds: number;
  heads: number;
  /** Rounds that found an animal other than the target, and the animals they counted. */
  bycatchRounds: number;
  bycatchHeads: number;
  /** Rounds that found the trap sprung or damaged without an animal. */
  troubleRounds: number;
  /** Catch or non-target rounds saved before a head count was asked for; they are left out of the heads. */
  uncountedRounds: number;
  /** Target animals per 100 trap-days, or null before a whole day has passed. */
  headsPer100TrapDays: number | null;
  /** Non-target animals as a share of every animal caught, in percent; null before any animal. */
  bycatchPercent: number | null;
}

/**
 * Catch per unit effort (CPUE) takes one trap standing one day as the unit of effort. A trap counts
 * from its setting time to its removal, or to the clock while still set. Only the animals whose count
 * was recorded enter the figures, and the rounds without a count are reported beside them.
 */
export function trapStats(trap: Trap, nowMs: number): TrapStats {
  const installedMs = parseLocalDateTime(trap.installedAt) ?? Number.NaN;
  const endMs = trap.removedAt === null ? nowMs : (parseLocalDateTime(trap.removedAt) ?? Number.NaN);
  const standingMs = endMs - installedMs;
  const trapDays = Number.isFinite(standingMs) && standingMs > 0 ? standingMs / DAY_MS : 0;
  const stats = {
    rounds: trap.checks.length,
    catchRounds: 0,
    heads: 0,
    bycatchRounds: 0,
    bycatchHeads: 0,
    troubleRounds: 0,
    uncountedRounds: 0,
  };
  for (const check of trap.checks) {
    if (check.result === 'trouble') stats.troubleRounds += 1;
    if (check.result !== 'caught' && check.result !== 'bycatch') continue;
    if (check.result === 'caught') stats.catchRounds += 1;
    else stats.bycatchRounds += 1;
    if (check.heads === undefined) {
      stats.uncountedRounds += 1;
      continue;
    }
    if (check.result === 'caught') stats.heads += check.heads;
    else stats.bycatchHeads += check.heads;
  }
  const animals = stats.heads + stats.bycatchHeads;
  return {
    trapDays,
    ...stats,
    headsPer100TrapDays: trapDays >= 1 ? (stats.heads / trapDays) * 100 : null,
    bycatchPercent: animals > 0 ? (stats.bycatchHeads / animals) * 100 : null,
  };
}

/** The same figures over every trap: effort and catches add up before the rates are taken. */
export function totalStats(traps: readonly Trap[], nowMs: number): TrapStats {
  const all = traps.map((trap) => trapStats(trap, nowMs));
  const sum = (key: keyof Omit<TrapStats, 'headsPer100TrapDays' | 'bycatchPercent'>) =>
    all.reduce((total, stats) => total + stats[key], 0);
  const trapDays = sum('trapDays');
  const heads = sum('heads');
  const bycatchHeads = sum('bycatchHeads');
  return {
    trapDays,
    rounds: sum('rounds'),
    catchRounds: sum('catchRounds'),
    heads,
    bycatchRounds: sum('bycatchRounds'),
    bycatchHeads,
    troubleRounds: sum('troubleRounds'),
    uncountedRounds: sum('uncountedRounds'),
    headsPer100TrapDays: trapDays >= 1 ? (heads / trapDays) * 100 : null,
    bycatchPercent: heads + bycatchHeads > 0 ? (bycatchHeads / (heads + bycatchHeads)) * 100 : null,
  };
}

// ---------------------------------------------------------------------------------------------------
// Work time and the daily report
// ---------------------------------------------------------------------------------------------------

/** Minutes worked in a stretch. An open stretch runs to the clock, read to the minute. */
export function sessionMinutes(session: WorkSession, nowMs: number): number {
  const startMs = parseLocalDateTime(session.start);
  const endMs = session.end === null ? Math.floor(nowMs / MINUTE_MS) * MINUTE_MS : parseLocalDateTime(session.end);
  if (startMs === null || endMs === null || endMs < startMs) return 0;
  return Math.round((endMs - startMs) / MINUTE_MS);
}

export interface DailyReportRow {
  /** YYYY-MM-DD on this device's calendar. */
  date: string;
  sessions: WorkSession[];
  /** Work that started that day, whole stretches, even one running past midnight. */
  workMinutes: number;
  rounds: number;
  /** Traps looked at that day, each counted once. */
  trapsChecked: number;
  heads: number;
  bycatchHeads: number;
  troubleRounds: number;
  /** Rounds that day whose animals have no count. */
  uncountedRounds: number;
  /** What was caught, by the species written on the round, with the heads. */
  species: { name: string; heads: number }[];
}

const dayOf = (localDateTime: string) => localDateTime.slice(0, 10);

/**
 * One row per day of a month that has work or a round, in date order. A stretch belongs to the day it
 * started on, as a day's report is written for the day the work began.
 */
export function buildDailyReport(
  traps: readonly Trap[],
  sessions: readonly WorkSession[],
  month: string,
  nowMs: number,
): DailyReportRow[] {
  const rows = new Map<string, DailyReportRow & { trapIds: Set<string>; speciesHeads: Map<string, number> }>();
  const row = (date: string) => {
    let entry = rows.get(date);
    if (!entry) {
      entry = {
        date,
        sessions: [],
        workMinutes: 0,
        rounds: 0,
        trapsChecked: 0,
        heads: 0,
        bycatchHeads: 0,
        troubleRounds: 0,
        uncountedRounds: 0,
        species: [],
        trapIds: new Set(),
        speciesHeads: new Map(),
      };
      rows.set(date, entry);
    }
    return entry;
  };
  for (const session of sessions) {
    if (!session.start.startsWith(month)) continue;
    const entry = row(dayOf(session.start));
    entry.sessions.push(session);
    entry.workMinutes += sessionMinutes(session, nowMs);
  }
  for (const trap of traps)
    for (const check of trap.checks) {
      if (!check.at.startsWith(month)) continue;
      const entry = row(dayOf(check.at));
      entry.rounds += 1;
      entry.trapIds.add(trap.id);
      if (check.result === 'trouble') entry.troubleRounds += 1;
      if (check.result !== 'caught' && check.result !== 'bycatch') continue;
      if (check.heads === undefined) {
        entry.uncountedRounds += 1;
        continue;
      }
      if (check.result === 'bycatch') {
        entry.bycatchHeads += check.heads;
        continue;
      }
      entry.heads += check.heads;
      const name = check.species?.trim() ?? '';
      entry.speciesHeads.set(name, (entry.speciesHeads.get(name) ?? 0) + check.heads);
    }
  return [...rows.values()]
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map(({ trapIds, speciesHeads, ...entry }) => ({
      ...entry,
      sessions: [...entry.sessions].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0)),
      trapsChecked: trapIds.size,
      species: [...speciesHeads.entries()].map(([name, heads]) => ({ name, heads })),
    }));
}

/** The month (YYYY-MM) a report opens on: that of the clock. */
export function monthOf(localDateTime: string): string {
  return localDateTime.slice(0, 7);
}

/** Hours and minutes, as a work sheet writes them. */
export function formatWorkMinutes(minutes: number, language: Language): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return language === 'ja' ? `${hours} 時間 ${rest} 分` : `${hours} h ${rest} min`;
}

// A spreadsheet runs a leading =, +, - or @ as a formula, so text a person typed is kept inert.
const inert = (value: string) => (/^[=+\-@\t\r]/.test(value) ? `'${value}` : value);
const cell = (value: string) => (/[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value);
const text = (value: string) => cell(inert(value));

const REPORT_HEADERS: Record<Language, readonly string[]> = {
  ja: [
    '日付',
    '作業時間（分）',
    '作業の時間帯',
    '見回り回数',
    '見回ったわな',
    '捕獲（頭）',
    '捕獲の内訳',
    '錯誤捕獲（頭）',
    '作動・破損',
    '頭数未記録',
    '作業メモ',
  ],
  en: [
    'Date',
    'Work (min)',
    'Work times',
    'Rounds',
    'Traps checked',
    'Caught (head)',
    'Caught by species',
    'Non-target (head)',
    'Sprung or damaged',
    'No count',
    'Work notes',
  ],
};

const speciesText = (row: DailyReportRow, language: Language) =>
  row.species
    .map(({ name, heads }) => `${name || (language === 'ja' ? '種名なし' : 'no species')} ${heads}`)
    .join(language === 'ja' ? '、' : '; ');

const sessionTimes = (row: DailyReportRow, language: Language) =>
  row.sessions
    .map(
      (session) =>
        `${session.start.slice(11)}–${session.end === null ? (language === 'ja' ? '作業中' : 'ongoing') : formatLocalDateTime(session.end).slice(session.end.slice(0, 10) === session.start.slice(0, 10) ? 11 : 0)}`,
    )
    .join(language === 'ja' ? '、' : '; ');

/** The month's report as CSV (RFC 4180, CRLF), one row per day. */
export function buildDailyReportCsv(rows: readonly DailyReportRow[], language: Language): string {
  const lines = [REPORT_HEADERS[language].join(',')];
  for (const row of rows)
    lines.push(
      [
        row.date,
        String(row.workMinutes),
        text(sessionTimes(row, language)),
        String(row.rounds),
        String(row.trapsChecked),
        String(row.heads),
        text(speciesText(row, language)),
        String(row.bycatchHeads),
        String(row.troubleRounds),
        String(row.uncountedRounds),
        text(
          row.sessions
            .map((session) => session.note.trim())
            .filter(Boolean)
            .join(' / '),
        ),
      ].join(','),
    );
  return lines.join('\r\n');
}

export { speciesText as dailySpeciesText, sessionTimes as dailySessionTimes };

// ---------------------------------------------------------------------------------------------------
// Calendar file
// ---------------------------------------------------------------------------------------------------

const icsText = (value: string) =>
  value.replaceAll('\\', '\\\\').replaceAll(';', '\\;').replaceAll(',', '\\,').replace(/\r?\n/g, '\\n');

/** UTC in the basic format iCalendar uses, so every calendar places the time the same way. */
const icsUtc = (ms: number) =>
  new Date(ms)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');

/** Lines longer than 75 octets are folded with a CRLF and a space (RFC 5545 3.1). */
export function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = '';
  let size = 0;
  for (const character of line) {
    const bytes = encoder.encode(character).length;
    // The first line holds 75 octets; the ones after it lose one to the leading space.
    if (size + bytes > (parts.length === 0 ? 75 : 74)) {
      parts.push(current);
      current = '';
      size = 0;
    }
    current += character;
    size += bytes;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

const EVENT_MINUTES = 30;

/**
 * An iCalendar file with the next round of each trap that is set, at the time its interval runs out.
 * The file is a snapshot: the calendar does not change when a round is recorded, so it is exported
 * again after each round. Each event carries an alarm at its start, which the calendar app raises.
 */
export function buildTrapIcs(traps: readonly Trap[], intervalHours: number, nowMs: number, language: Language) {
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Nilay Labs//Trap Check Log//JA',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];
  let events = 0;
  for (const trap of traps) {
    const status = getTrapStatus(trap, intervalHours, nowMs);
    if (status.state !== 'ok' && status.state !== 'overdue') continue;
    events += 1;
    const summary = t(`わなの見回り：${trap.name}`, `Trap check: ${trap.name}`);
    const description = [
      status.state === 'overdue'
        ? t('書き出した時点で見回り間隔を過ぎていました。', 'It was already past the interval when exported.')
        : t(`見回り間隔 ${intervalHours} 時間`, `Check interval ${intervalHours} h`),
      t(`基準：${formatLocalDateTime(status.baseAt)}`, `Counted from ${formatLocalDateTime(status.baseAt)}`),
      trap.location,
    ]
      .filter(Boolean)
      .join('\n');
    lines.push(
      'BEGIN:VEVENT',
      `UID:${trap.id}-${status.dueAtMs}@labs.nilay.jp`,
      `DTSTAMP:${icsUtc(nowMs)}`,
      `DTSTART:${icsUtc(status.dueAtMs)}`,
      `DTEND:${icsUtc(status.dueAtMs + EVENT_MINUTES * MINUTE_MS)}`,
      `SUMMARY:${icsText(summary)}`,
      `DESCRIPTION:${icsText(description)}`,
      ...(trap.latitude !== null && trap.longitude !== null ? [`GEO:${trap.latitude};${trap.longitude}`] : []),
      ...(trap.location ? [`LOCATION:${icsText(trap.location)}`] : []),
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${icsText(summary)}`,
      'TRIGGER:PT0M',
      'END:VALARM',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return { ics: `${lines.map(foldIcsLine).join('\r\n')}\r\n`, events };
}

// ---------------------------------------------------------------------------------------------------
// Positions
// ---------------------------------------------------------------------------------------------------

/** Six decimal places is about 0.1 m, finer than any phone reads a position. */
export function roundCoordinate(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}
