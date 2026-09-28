// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";

import { formatJst, isoSeconds } from "../src/time.ts";

describe("formatJst", () => {
  it("shows an instant as a 24-hour JST wall clock across the UTC day boundary", () => {
    const beforeMidnight = Date.parse("2026-09-28T14:59:59.9Z") / 1000;
    expect(formatJst(beforeMidnight)).toBe("2026/9/28 23:59:59 JST");
    expect(formatJst(beforeMidnight + 0.1)).toBe("2026/9/29 00:00:00 JST");
    expect(formatJst(Date.parse("2026-12-31T15:00:00Z") / 1000)).toBe(
      "2027/1/1 00:00:00 JST",
    );
    // The stored machine timestamp stays UTC.
    expect(isoSeconds(beforeMidnight)).toBe("2026-09-28T14:59:59+00:00");
  });

  it("refuses an instant outside the calendar range", () => {
    expect(() => formatJst(Number.NaN)).toThrow(RangeError);
  });
});
