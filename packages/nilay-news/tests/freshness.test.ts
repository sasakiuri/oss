// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";

import {
  DATE_PRECISION,
  FRESHNESS_SECONDS,
  freshness,
  isFreshPublication,
  mergePublication,
  newestFirst,
  publicationSeconds,
} from "../src/freshness.ts";
import { japaneseDate } from "../src/time.ts";

// 2026-09-28T03:00:00Z, 12:00 JST.
const NOW = Date.UTC(2026, 8, 28, 3) / 1000;
const iso = (seconds: number) => new Date(seconds * 1000).toISOString();

describe("freshness", () => {
  it("is a rolling, inclusive 24 hour window", () => {
    expect(FRESHNESS_SECONDS).toBe(86400);
    expect(freshness(iso(NOW), NOW)).toBe("fresh");
    expect(freshness(iso(NOW - 86400), NOW)).toBe("fresh");
    expect(freshness(iso(NOW - 86401), NOW)).toBe("stale");
    expect(freshness(iso(NOW + 1), NOW)).toBe("future");
    expect(isFreshPublication(iso(NOW - 86400), NOW)).toBe(true);
    expect(isFreshPublication(iso(NOW - 86401), NOW)).toBe(false);
    expect(isFreshPublication(iso(NOW + 1), NOW)).toBe(false);
  });

  it("honours the time zone of the publication time", () => {
    // The same instant as NOW - 24h in JST, RFC 2822 and a US zone.
    for (const value of [
      "2026-09-27T12:00:00+09:00",
      "Sun, 27 Sep 2026 03:00:00 GMT",
      "Sat, 26 Sep 2026 23:00:00 EDT",
      "2026-09-27T03:00:00.000Z",
    ]) {
      expect(publicationSeconds(value)).toBe(NOW - 86400);
      expect(freshness(value, NOW)).toBe("fresh");
      expect(freshness(value, NOW + 1)).toBe("stale");
    }
    expect(freshness("2026-09-28T11:59:59+09:00", NOW)).toBe("fresh");
    expect(freshness("2026-09-28T12:00:01+09:00", NOW)).toBe("future");
  });

  it("treats missing, zoneless and impossible times as not fresh", () => {
    for (const value of [null, undefined, "", "   "])
      expect(freshness(value, NOW)).toBe("unknown");
    for (const value of [
      "2026-09-28T02:00:00", // No zone: ambiguous.
      "2026-09-28", // Calendar date without a zone.
      "2026-02-29T00:00:00Z", // Not a leap year.
      "2026-09-31T00:00:00Z", // Month rollover.
      "2026-13-01T00:00:00Z",
      "2026-09-28T24:00:00Z",
      "2026-09-28T00:00:60Z",
      "Mon, 28 Sep 2026 00:00:00 -0000", // Explicitly unknown zone.
      "Mon, 28 Sep 2026 00:00:00 XYZ",
      "yesterday",
    ]) {
      expect(publicationSeconds(value)).toBeNull();
      expect(freshness(value, NOW)).toBe("invalid");
      expect(isFreshPublication(value, NOW)).toBe(false);
    }
    expect(() => freshness(iso(NOW), Number.NaN)).toThrow(RangeError);
  });

  describe("a date-only publication", () => {
    const [today] = japaneseDate("2026年9月28日");
    const [yesterday] = japaneseDate("2026年9月27日");
    const [twoDaysAgo] = japaneseDate("2026年9月26日");
    const [tomorrow] = japaneseDate("2026年9月29日");
    // 2026-09-28 00:00 JST and 23:59:59 JST.
    const MIDNIGHT = Date.UTC(2026, 8, 27, 15) / 1000;
    const LAST = MIDNIGHT + 86400 - 1;

    it("is fresh on its JST date and the following day", () => {
      expect(DATE_PRECISION).toBe("date");
      expect(today).toBe("2026-09-27T15:00:00Z");
      for (const now of [MIDNIGHT, NOW, LAST]) {
        expect(freshness(today, now, "date")).toBe("fresh");
        expect(freshness(yesterday, now, "date")).toBe("fresh");
        expect(isFreshPublication(yesterday, now, "date")).toBe(true);
        expect(freshness(twoDaysAgo, now, "date")).toBe("stale");
        expect(isFreshPublication(twoDaysAgo, now, "date")).toBe(false);
      }
      // Yesterday expires at the next JST midnight; today's date is kept.
      expect(freshness(yesterday, LAST + 1, "date")).toBe("stale");
      expect(freshness(today, LAST + 1, "date")).toBe("fresh");
      expect(freshness(today, LAST + 86400, "date")).toBe("fresh");
      expect(freshness(today, LAST + 86401, "date")).toBe("stale");
      // The calendar day, not the text's zone, is compared.
      expect(freshness("2026-09-27T00:00:00+09:00", LAST, "date")).toBe(
        "fresh",
      );
    });

    it("never allows a later date", () => {
      expect(freshness(tomorrow, LAST, "date")).toBe("future");
      expect(freshness(tomorrow, LAST + 1, "date")).toBe("fresh");
      expect(isFreshPublication(tomorrow, NOW, "date")).toBe(false);
    });

    it("needs both the flag and an exact JST midnight", () => {
      // The same timestamps without the flag use the rolling window.
      for (const precision of [undefined, "", "DATE", "day", "exact"]) {
        expect(freshness(yesterday, NOW, precision)).toBe("stale");
        expect(isFreshPublication(yesterday, NOW, precision)).toBe(false);
        expect(freshness(yesterday, MIDNIGHT, precision)).toBe("fresh");
        expect(freshness(yesterday, MIDNIGHT + 1, precision)).toBe("stale");
      }
      // A timed value is never widened by the flag.
      for (const value of [
        "2026-09-27T00:00:01+09:00",
        "2026-09-27T00:00:00.500+09:00",
        "2026-09-27T00:00:00Z",
      ])
        expect(freshness(value, NOW, "date")).toBe("stale");
      expect(freshness("2026-09-28T13:00:00+09:00", NOW, "date")).toBe(
        "future",
      );
    });

    it("keeps missing and invalid values out", () => {
      for (const value of [null, undefined, "", " "])
        expect(freshness(value, NOW, "date")).toBe("unknown");
      for (const value of [
        "2026-09-28",
        "2026-09-28T00:00:00",
        "2026-02-29T00:00:00+09:00",
        "Mon, 28 Sep 2026 00:00:00 -0000",
      ]) {
        expect(freshness(value, NOW, "date")).toBe("invalid");
        expect(isFreshPublication(value, NOW, "date")).toBe(false);
      }
    });
  });
});

describe("newestFirst", () => {
  it("orders by publication, then discovery, then id, undated last", () => {
    const article = (
      id: string,
      publishedAt: string | null,
      discoveredAt = "2026-09-28T00:00:00+00:00",
    ) => ({ id, publishedAt, discoveredAt });
    const items = [
      article("a", "2026-09-28T01:00:00Z"),
      article("undated", null),
      article("b", "2026-09-28T11:00:00+09:00"), // 02:00Z
      article("c", "2026-09-28T01:00:00Z", "2026-09-28T01:00:00+00:00"),
      article("invalid", "2026-09-28"),
      article("d", "2026-09-28T01:00:00+00:00"),
    ];
    expect(items.sort(newestFirst).map(({ id }) => id)).toEqual([
      "b",
      "c",
      "a",
      "d",
      "invalid",
      "undated",
    ]);
    expect(newestFirst(items[0]!, items[0]!)).toBe(0);
  });
});

describe("mergePublication", () => {
  const early = "2026-09-27T00:00:00Z";
  const late = "2026-09-28T00:00:00Z";

  it("never moves a valid time forward and keeps the earliest", () => {
    expect(mergePublication(early, late, true)).toBe(early);
    expect(mergePublication(late, early, false)).toBe(early);
    expect(
      mergePublication(
        "2026-09-27T02:00:00Z",
        "2026-09-27T12:00:00Z",
        true,
        "date",
      ),
    ).toBe("2026-09-27T02:00:00Z");
    expect(mergePublication(early, "2026-09-27T09:00:00+09:00", true)).toBe(
      early,
    );
  });

  it("fills and corrects missing, invalid and future times", () => {
    expect(mergePublication(null, late, false)).toBe(late);
    expect(mergePublication(undefined, null, true)).toBeNull();
    expect(mergePublication(null, "bad", false)).toBe("bad");
    expect(mergePublication("bad", late, false)).toBe(late);
    expect(mergePublication("bad", "worse", false)).toBe("bad");
    expect(mergePublication("bad", "worse", true)).toBe("worse");
    // A future time is later than any past correction.
    expect(mergePublication("2099-01-01T00:00:00Z", early, false)).toBe(early);
    expect(mergePublication(early, "2099-01-01T00:00:00Z", true)).toBe(early);
    expect(mergePublication(early, "bad", true)).toBe(early);
    expect(mergePublication(early, "", true)).toBe(early);
  });
});
