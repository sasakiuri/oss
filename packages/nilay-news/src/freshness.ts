// SPDX-License-Identifier: MIT
/**
 * Publication age, never discovery or update time, gates automatic
 * classification and posting.
 *
 * A publication time must carry a valid time zone and is judged on a rolling
 * 24-hour window. The one exception, requested by the user, is a source that
 * states only a calendar date: its collector stores JST midnight and marks the
 * item with `publicationPrecision: "date"`, and such an item is fresh on its
 * JST date and the following day. Midnight alone never implies a date-only
 * publication, so a timed feed entry at 00:00 stays on the rolling window.
 */
import type { Article } from "./domain.ts";
import { feedDate } from "./time.ts";

/** Rolling window, inclusive: exactly 24 hours old is still fresh. */
export const FRESHNESS_SECONDS = 24 * 3600;
/** `metadata.publicationPrecision` of an item whose source states only a JST date. */
export const DATE_PRECISION = "date";
export type Freshness = "fresh" | "stale" | "unknown" | "invalid" | "future";

const JST_OFFSET = 9 * 3600;
const DAY = 86400;

/** Days since the epoch in JST. */
function jstDay(seconds: number): number {
  return Math.floor((seconds + JST_OFFSET) / DAY);
}

/** Epoch seconds of a zoned publication time, or null when missing or invalid. */
export function publicationSeconds(
  value: string | null | undefined,
): number | null {
  const normalized = feedDate(value);
  return normalized === null ? null : Date.parse(normalized) / 1000;
}

/**
 * Freshness of a publication at `now` (epoch seconds). `precision` is the
 * item's `metadata.publicationPrecision`; only `"date"` on a time that is
 * exactly JST midnight selects the calendar rule (today or yesterday in JST
 * is fresh, earlier is stale, a later date is future). Any other precision,
 * including a missing or unrecognised one, uses the rolling window.
 */
export function freshness(
  value: string | null | undefined,
  now: number,
  precision?: string,
): Freshness {
  if (!Number.isFinite(now)) throw new RangeError("Invalid freshness clock");
  if (!value?.trim()) return "unknown";
  const published = publicationSeconds(value);
  if (published === null) return "invalid";
  if (
    precision === DATE_PRECISION &&
    Number.isInteger(published) &&
    (published + JST_OFFSET) % DAY === 0
  ) {
    const age = jstDay(now) - jstDay(published);
    if (age < 0) return "future";
    return age > 1 ? "stale" : "fresh";
  }
  if (published > now) return "future";
  return now - published > FRESHNESS_SECONDS ? "stale" : "fresh";
}

export function isFreshPublication(
  value: string | null | undefined,
  now: number,
  precision?: string,
): boolean {
  return freshness(value, now, precision) === "fresh";
}

/**
 * The publication time an existing article keeps when a source reports
 * `incoming`. The earliest valid time wins, so a later update, re-listing or
 * newer feed timestamp never makes an old story fresh again. A valid time
 * replaces a missing or invalid one; an invalid text only fills a missing
 * time, or replaces an invalid one when reported by the content owner.
 */
export function mergePublication(
  existing: string | null | undefined,
  incoming: string | null | undefined,
  owner: boolean,
  existingPrecision?: string,
  incomingPrecision?: string,
): string | null {
  const current = existing ?? null;
  if (!incoming?.trim()) return current;
  const next = publicationSeconds(incoming);
  const previous = publicationSeconds(current);
  if (next === null)
    return !current?.trim() || (previous === null && owner)
      ? incoming
      : current;
  if (previous === null) return incoming;
  // A real time refines a date on that same day. A date-only reread must
  // never erase a known time or extend that article's eligibility.
  if (jstDay(next) === jstDay(previous)) {
    const previousDate =
      existingPrecision === DATE_PRECISION &&
      (previous + JST_OFFSET) % DAY === 0;
    const nextDate =
      incomingPrecision === DATE_PRECISION && (next + JST_OFFSET) % DAY === 0;
    if (previousDate && !nextDate) return incoming;
    if (!previousDate && nextDate) return current;
  }
  return next < previous ? incoming : current;
}

type Ordered = Pick<Article, "id" | "publishedAt" | "discoveredAt">;

/**
 * Newest publication first, then latest discovery, then id; undated and
 * invalid publication times sort last.
 */
export function newestFirst(a: Ordered, b: Ordered): number {
  const aTime = publicationSeconds(a.publishedAt) ?? Number.NEGATIVE_INFINITY;
  const bTime = publicationSeconds(b.publishedAt) ?? Number.NEGATIVE_INFINITY;
  if (aTime !== bTime) return aTime > bTime ? -1 : 1;
  if (a.discoveredAt !== b.discoveredAt)
    return a.discoveredAt > b.discoveredAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
