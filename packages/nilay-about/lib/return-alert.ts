/**
 * The return check: when a registered return time passes without the return button being pressed,
 * the owner is reminded first and, after a grace period, the owner's devices and the watchers are
 * told. Pure scheduling; storage and sending are in the feature's server code.
 */

export const GRACE_MINUTES_OPTIONS = [0, 15, 30, 60, 120, 180] as const;
/** After the first overdue alert, it is repeated at this interval, this many times in all. */
export const OVERDUE_REPEAT_MINUTES = 60;
export const OVERDUE_ALERTS = 3;
/** A plan cannot end further ahead than this. */
export const RETURN_MAX_DAYS = 7;
export const RETURN_NOTE_MAX_LENGTH = 200;
export const RETURN_WATCHERS_MAX = 10;
/** The scheduled check runs every five minutes, so an alert can be up to this late. */
export const CHECK_INTERVAL_MINUTES = 5;

export type ReturnStage = 'waiting' | 'reminded' | 'overdue';

export interface ReturnSchedule {
  stage: ReturnStage;
  /** Milliseconds since the epoch. */
  returnAt: number;
  graceMinutes: number;
  /** Overdue alerts sent so far. */
  overdueAlerts: number;
}

export type ReturnAction = 'remind-owner' | 'alert-everyone' | null;

/**
 * What a check at `nowMs` should send, and the schedule after it. `dueAt` is when the next check
 * has something to do, or null once the alerts are spent.
 */
export function stepReturnSchedule(
  schedule: ReturnSchedule,
  nowMs: number,
): { action: ReturnAction; next: ReturnSchedule; dueAt: number | null } {
  const alertAt = schedule.returnAt + schedule.graceMinutes * 60_000;
  if (schedule.stage === 'waiting') {
    if (nowMs < schedule.returnAt) return { action: null, next: schedule, dueAt: schedule.returnAt };
    // With no grace period, or a check that came late, the owner's reminder is folded into the alert.
    if (nowMs < alertAt) {
      return { action: 'remind-owner', next: { ...schedule, stage: 'reminded' }, dueAt: alertAt };
    }
  } else if (schedule.stage === 'reminded' && nowMs < alertAt) {
    return { action: null, next: schedule, dueAt: alertAt };
  }
  if (schedule.stage === 'overdue') {
    if (schedule.overdueAlerts >= OVERDUE_ALERTS) return { action: null, next: schedule, dueAt: null };
    const repeatAt = alertAt + schedule.overdueAlerts * OVERDUE_REPEAT_MINUTES * 60_000;
    if (nowMs < repeatAt) return { action: null, next: schedule, dueAt: repeatAt };
  }
  const overdueAlerts = schedule.overdueAlerts + 1;
  return {
    action: 'alert-everyone',
    next: { ...schedule, stage: 'overdue', overdueAlerts },
    dueAt: overdueAlerts >= OVERDUE_ALERTS ? null : alertAt + overdueAlerts * OVERDUE_REPEAT_MINUTES * 60_000,
  };
}

/** When the schedule next has something to do, or null once the alerts are spent. */
export function scheduleDueAt(schedule: ReturnSchedule): number | null {
  const alertAt = schedule.returnAt + schedule.graceMinutes * 60_000;
  if (schedule.stage === 'waiting') return schedule.returnAt;
  if (schedule.stage === 'reminded') return alertAt;
  return schedule.overdueAlerts >= OVERDUE_ALERTS
    ? null
    : alertAt + schedule.overdueAlerts * OVERDUE_REPEAT_MINUTES * 60_000;
}

/** The watch link's fragment. A fragment is never sent to a server, so the token stays out of logs. */
export const watchFragment = (planId: string, token: string) => `#watch=${planId}.${token}`;

export function readWatchFragment(hash: string): { planId: string; token: string } | null {
  const match = /^#watch=([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/.exec(hash);
  return match?.[1] && match[2] ? { planId: match[1], token: match[2] } : null;
}

/**
 * Values another tool (the entry plan card) can pass in the address to start a plan:
 * `?returnAt=2026-11-15T17:00&note=...`. The time is a wall-clock time on this device.
 */
export function readPlanPrefill(search: string): { returnAt?: string; note?: string } {
  const params = new URLSearchParams(search);
  const returnAt = params.get('returnAt') ?? '';
  const note = params.get('note') ?? '';
  return {
    ...(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(returnAt) ? { returnAt } : {}),
    ...(note ? { note: [...note].slice(0, RETURN_NOTE_MAX_LENGTH).join('') } : {}),
  };
}

/** A plan's state as its pages show it. */
export function returnStatus(schedule: ReturnSchedule, nowMs: number): 'before' | 'grace' | 'overdue' {
  if (nowMs < schedule.returnAt) return 'before';
  return nowMs < schedule.returnAt + schedule.graceMinutes * 60_000 ? 'grace' : 'overdue';
}
