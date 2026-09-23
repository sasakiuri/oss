import {
  readLocalDateTime,
  type CheckResult,
  type Trap,
  type TrapCheck,
  type TrapKind,
} from '@/lib/schemas/trap-check-log';

export type Language = 'ja' | 'en';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/** Shared by the screen, the printed sheet and the CSV, so the three never name a kind differently. */
export const TRAP_KIND_LABELS: Record<TrapKind, { ja: string; en: string }> = {
  kukuri: { ja: 'くくりわな', en: 'Snare' },
  hako: { ja: 'はこわな', en: 'Box trap' },
  kakoi: { ja: '囲いわな', en: 'Corral trap' },
  hakootoshi: { ja: 'はこおとし', en: 'Deadfall box' },
  other: { ja: 'その他', en: 'Other' },
};

export const CHECK_RESULT_LABELS: Record<CheckResult, { ja: string; en: string }> = {
  nothing: { ja: '異常なし', en: 'Nothing caught' },
  caught: { ja: '捕獲あり', en: 'Animal caught' },
  bycatch: { ja: '錯誤捕獲', en: 'Non-target catch' },
  trouble: { ja: '作動・破損など', en: 'Sprung or damaged' },
};

/** Reads a `datetime-local` value as a time on this device's clock. */
export function parseLocalDateTime(value: string): number | null {
  const parts = readLocalDateTime(value);
  if (!parts) return null;
  return new Date(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute).getTime();
}

/** The value a `datetime-local` field expects, to the minute, on this device's clock. */
export function toLocalDateTime(ms: number): string {
  const date = new Date(ms);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** The current minute as a `datetime-local` value. Read at the moment of saving, not at render. */
export function currentLocalMinute(): string {
  return toLocalDateTime(Date.now());
}

export type CheckTimeError = 'invalid' | 'beforeInstalled';

/**
 * Whether a round can be recorded at this time. A round before the trap was set cannot have
 * happened, and saving it would leave a record the elapsed time does not count.
 */
export function validateCheckTime(trap: Pick<Trap, 'installedAt'>, at: string): CheckTimeError | null {
  const atMs = parseLocalDateTime(at);
  if (atMs === null) return 'invalid';
  const installedMs = parseLocalDateTime(trap.installedAt);
  if (installedMs !== null && atMs < installedMs) return 'beforeInstalled';
  return null;
}

/** The same time as people write it, for the printed sheet and the CSV. */
export function formatLocalDateTime(value: string): string {
  return value.replace('T', ' ');
}

/** The latest round by its recorded time, not by the order it was entered in. */
export function latestCheck(trap: Pick<Trap, 'checks'>): TrapCheck | null {
  let latest: TrapCheck | null = null;
  for (const check of trap.checks) {
    // The fixed-width format sorts as text in time order; a tie goes to the one entered later.
    if (latest === null || check.at >= latest.at) latest = check;
  }
  return latest;
}

export type TrapStatus =
  | { state: 'removed'; removedAt: string }
  /** Registered with a setting time still ahead of the clock. */
  | { state: 'notInstalled'; installedAt: string }
  /** The latest round is recorded later than the clock, which is almost always a typing slip. */
  | { state: 'future'; baseAt: string }
  | {
      state: 'ok' | 'overdue';
      /**
       * Whether the time is counted from the last round or from setting the trap. `installedBeforeChecks`
       * means rounds exist but all are dated before the setting time, so none of them is counted.
       */
      since: 'check' | 'installed' | 'installedBeforeChecks';
      baseAt: string;
      elapsedMs: number;
      dueAtMs: number;
      /** Until the interval runs out; below zero once it has. */
      remainingMs: number;
    };

/**
 * Where a trap stands against the interval the person chose.
 *
 * The clock starts at the last recorded round, or at the setting time before there is one. The
 * trap is overdue once more time than the interval has passed: through the minute the interval
 * runs out it is due, not yet past it.
 */
export function getTrapStatus(trap: Trap, intervalHours: number, clockMs: number): TrapStatus {
  // Every recorded time is to the minute, so the clock is read to the minute as well. Otherwise the
  // seconds past a round's minute would show a round just saved as "0 min ago, 23 h 59 min left".
  const nowMs = Math.floor(clockMs / MINUTE_MS) * MINUTE_MS;
  if (trap.removedAt !== null) return { state: 'removed', removedAt: trap.removedAt };
  const installedMs = parseLocalDateTime(trap.installedAt) ?? Number.NaN;
  if (installedMs > nowMs) return { state: 'notInstalled', installedAt: trap.installedAt };
  const last = latestCheck(trap);
  // A round cannot come before the trap was set, so a slip there counts from the setting time.
  const lastMs = last ? (parseLocalDateTime(last.at) ?? Number.NaN) : Number.NaN;
  const fromCheck = last !== null && lastMs >= installedMs;
  const baseAt = fromCheck ? last.at : trap.installedAt;
  const baseMs = fromCheck ? lastMs : installedMs;
  if (baseMs > nowMs) return { state: 'future', baseAt };
  const elapsedMs = nowMs - baseMs;
  const intervalMs = intervalHours * HOUR_MS;
  const dueAtMs = baseMs + intervalMs;
  return {
    state: elapsedMs > intervalMs ? 'overdue' : 'ok',
    since: fromCheck ? 'check' : last === null ? 'installed' : 'installedBeforeChecks',
    baseAt,
    elapsedMs,
    dueAtMs,
    remainingMs: dueAtMs - nowMs,
  };
}

/** Whole days, hours and minutes, each rounded down, so a trap never looks more recently checked than it was. */
export function splitDuration(ms: number): { days: number; hours: number; minutes: number } {
  const totalMinutes = Math.floor(Math.max(0, ms) / MINUTE_MS);
  return {
    days: Math.floor(totalMinutes / (24 * 60)),
    hours: Math.floor(totalMinutes / 60) % 24,
    minutes: totalMinutes % 60,
  };
}

/** Always down to the minute, so a wait of 49 h 30 min is not shown as 2 d 1 h. */
export function formatDuration(ms: number, language: Language): string {
  const { days, hours, minutes } = splitDuration(ms);
  const [d, h, m] = language === 'ja' ? ['日', '時間', '分'] : ['d', 'h', 'min'];
  const parts: string[] = [];
  if (days > 0) parts.push(`${days} ${d}`);
  if (hours > 0 || days > 0) parts.push(`${hours} ${h}`);
  parts.push(`${minutes} ${m}`);
  return parts.join(' ');
}

export interface TrapSummary {
  /** Set and not yet taken up, including those whose setting time is still ahead. */
  active: number;
  overdue: number;
  removed: number;
}

export function summarizeTraps(traps: readonly Trap[], intervalHours: number, nowMs: number): TrapSummary {
  const summary: TrapSummary = { active: 0, overdue: 0, removed: 0 };
  for (const trap of traps) {
    const status = getTrapStatus(trap, intervalHours, nowMs);
    if (status.state === 'removed') summary.removed += 1;
    else {
      summary.active += 1;
      if (status.state === 'overdue') summary.overdue += 1;
    }
  }
  return summary;
}

const STATE_ORDER: Record<TrapStatus['state'], number> = {
  future: 0,
  overdue: 1,
  ok: 1,
  notInstalled: 2,
  removed: 3,
};

/**
 * The order of a round: the trap waited on longest first. A time recorded in the future leads,
 * because it hides a trap from the warning until it is corrected. Removed traps come last.
 */
export function orderForRound(traps: readonly Trap[], intervalHours: number, nowMs: number): Trap[] {
  const keyed = traps.map((trap, index) => ({ trap, index, status: getTrapStatus(trap, intervalHours, nowMs) }));
  keyed.sort((a, b) => {
    const byState = STATE_ORDER[a.status.state] - STATE_ORDER[b.status.state];
    if (byState !== 0) return byState;
    if ('dueAtMs' in a.status && 'dueAtMs' in b.status && a.status.dueAtMs !== b.status.dueAtMs)
      return a.status.dueAtMs - b.status.dueAtMs;
    return a.index - b.index;
  });
  return keyed.map((entry) => entry.trap);
}

/** Checks in time order, earliest first, as a log is read. */
export function sortedChecks(trap: Pick<Trap, 'checks'>): TrapCheck[] {
  return trap.checks
    .map((check, index) => ({ check, index }))
    .sort((a, b) => (a.check.at === b.check.at ? a.index - b.index : a.check.at < b.check.at ? -1 : 1))
    .map((entry) => entry.check);
}

// A spreadsheet runs a leading =, +, - or @ as a formula, so text a person typed is kept inert.
const inert = (value: string) => (/^[=+\-@\t\r]/.test(value) ? `'${value}` : value);
// Quoted whenever a comma, a quote or a line break would otherwise split the cell (RFC 4180).
const cell = (value: string) => (/[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value);
const text = (value: string) => cell(inert(value));

const CSV_HEADERS: Record<Language, readonly string[]> = {
  ja: ['識別名', '種類', '設置日時', '撤去日時', '場所メモ', '緯度', '経度', '見回り日時', '結果', 'メモ'],
  en: [
    'Name',
    'Kind',
    'Set at',
    'Removed at',
    'Location note',
    'Latitude',
    'Longitude',
    'Checked at',
    'Result',
    'Note',
  ],
};

/**
 * One row per recorded round, with the trap's details repeated on each so the file can be sorted
 * and filtered as it is. A trap with no round yet still gets one row, with the round left blank.
 * Lines end in CRLF, as RFC 4180 has them.
 */
export function buildTrapCheckCsv(traps: readonly Trap[], language: Language): string {
  const lines = [CSV_HEADERS[language].join(',')];
  for (const trap of traps) {
    const head = [
      text(trap.name),
      TRAP_KIND_LABELS[trap.kind][language],
      formatLocalDateTime(trap.installedAt),
      trap.removedAt === null ? '' : formatLocalDateTime(trap.removedAt),
      text(trap.location),
      trap.latitude === null ? '' : String(trap.latitude),
      trap.longitude === null ? '' : String(trap.longitude),
    ];
    const checks = sortedChecks(trap);
    if (checks.length === 0) lines.push([...head, '', '', ''].join(','));
    for (const check of checks)
      lines.push(
        [...head, formatLocalDateTime(check.at), CHECK_RESULT_LABELS[check.result][language], text(check.note)].join(
          ',',
        ),
      );
  }
  return lines.join('\r\n');
}
