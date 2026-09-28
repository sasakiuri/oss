// SPDX-License-Identifier: MIT
/**
 * Fixed daily collection times in Japan Standard Time (UTC+9, no DST).
 *
 * A daily source runs once per JST day, starting at its configured time.
 * Before that time the day's run is not due, even if yesterday's was missed;
 * after it, an unclaimed run for the current day is due immediately. The next
 * run is always the following day's slot, never 24 hours after a late start.
 */
const JST_OFFSET = 9 * 3600;
const DAY = 86400;
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Minutes after JST midnight for a valid `HH:MM`, or null. */
export function dailyMinutes(value: unknown): number | null {
  const match = typeof value === "string" ? TIME.exec(value) : null;
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** Epoch seconds of today's (JST) run at `at` for the instant `now`. */
export function dailySlot(now: number, at: string): number {
  const minutes = dailyMinutes(at);
  if (minutes === null) throw new RangeError(`invalid daily time ${at}`);
  const local = Math.floor(now) + JST_OFFSET;
  const midnight = local - (((local % DAY) + DAY) % DAY) - JST_OFFSET;
  return midnight + minutes * 60;
}

/**
 * When a daily source is next due; at most `now` when due now. `lastStarted`
 * is the persisted start of the latest claimed run, if any.
 */
export function nextDailyRun(
  now: number,
  at: string,
  lastStarted: number | null | undefined,
): number {
  const slot = dailySlot(now, at);
  if (now < slot) return slot;
  return (lastStarted ?? Number.NEGATIVE_INFINITY) >= slot ? slot + DAY : slot;
}

/**
 * The first JST phase slot at or after `at` of a rolling source collected
 * every `periodMinutes` from `offsetMinutes` after JST midnight. The period
 * divides a day, so the slots are the same every JST day.
 */
export function nextPhase(
  at: number,
  offsetMinutes: number,
  periodMinutes: number,
): number {
  const period = periodMinutes * 60;
  if (
    !Number.isInteger(periodMinutes) ||
    periodMinutes < 1 ||
    DAY % period ||
    !Number.isInteger(offsetMinutes) ||
    offsetMinutes < 0 ||
    offsetMinutes >= periodMinutes
  )
    throw new RangeError(`invalid phase ${offsetMinutes}/${periodMinutes}`);
  const origin = offsetMinutes * 60 - JST_OFFSET;
  return origin + Math.ceil((at - origin) / period) * period;
}
