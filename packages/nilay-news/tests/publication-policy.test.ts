// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";

import {
  isPostingTime,
  nextPostingAt,
  POST_WINDOW_LABEL,
} from "../src/publication-policy.ts";

/** Epoch seconds of a Japan wall-clock time, written independently of the policy. */
function jst(text: string): number {
  return Date.parse(`${text}+09:00`) / 1000;
}

describe("posting window", () => {
  it("allows sending from 06:00 inclusive to 23:00 exclusive JST", () => {
    for (const [time, allowed] of [
      ["2026-09-28T05:59:59", false],
      ["2026-09-28T06:00:00", true],
      ["2026-09-28T12:00:00", true],
      ["2026-09-28T22:59:59", true],
      ["2026-09-28T23:00:00", false],
      ["2026-09-28T23:59:59", false],
      ["2026-09-29T00:00:00", false],
    ] as const)
      expect([time, isPostingTime(jst(time))]).toEqual([time, allowed]);
    // Fractions just around both edges.
    expect(isPostingTime(jst("2026-09-28T06:00:00") - 0.001)).toBe(false);
    expect(isPostingTime(jst("2026-09-28T23:00:00") - 0.001)).toBe(true);
  });

  it("uses JST, not the UTC day or the host zone", () => {
    // 21:00 UTC is 06:00 JST on the next day; 14:00 UTC is 23:00 JST.
    expect(isPostingTime(Date.UTC(2026, 8, 27, 21) / 1000)).toBe(true);
    expect(isPostingTime(Date.UTC(2026, 8, 27, 20, 59, 59) / 1000)).toBe(false);
    expect(isPostingTime(Date.UTC(2026, 8, 28, 13, 59, 59) / 1000)).toBe(true);
    expect(isPostingTime(Date.UTC(2026, 8, 28, 14) / 1000)).toBe(false);
    // Before the epoch, the remainder must not go negative.
    expect(isPostingTime(jst("1969-12-31T07:00:00"))).toBe(true);
    expect(isPostingTime(jst("1969-12-31T23:30:00"))).toBe(false);
  });

  it("keeps an allowed time and moves any other time to the next 06:00 JST", () => {
    for (const time of ["2026-09-28T06:00:00", "2026-09-28T22:59:59"])
      expect(nextPostingAt(jst(time))).toBe(jst(time));
    for (const [time, next] of [
      ["2026-09-28T23:00:00", "2026-09-29T06:00:00"],
      ["2026-09-28T23:30:00", "2026-09-29T06:00:00"],
      ["2026-09-29T00:00:00", "2026-09-29T06:00:00"],
      ["2026-09-29T05:59:59", "2026-09-29T06:00:00"],
      // Across a month and a year boundary.
      ["2026-09-30T23:10:00", "2026-10-01T06:00:00"],
      ["2026-12-31T23:10:00", "2027-01-01T06:00:00"],
    ] as const)
      expect([time, nextPostingAt(jst(time))]).toEqual([time, jst(next)]);
    expect(isPostingTime(nextPostingAt(jst("2026-09-28T23:00:00")))).toBe(true);
  });

  it("refuses a clock that is not a finite number", () => {
    for (const value of [Number.NaN, Infinity, -Infinity]) {
      expect(() => isPostingTime(value)).toThrow(RangeError);
      expect(() => nextPostingAt(value)).toThrow(RangeError);
    }
  });

  it("labels the window truthfully", () => {
    expect(POST_WINDOW_LABEL).toBe("06:00〜23:00 JST（23:00以降送信なし）");
  });
});
