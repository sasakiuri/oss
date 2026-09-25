import { describe, expect, it } from 'vitest';

import { getMoonTimes, moonAge, moonIlluminatedFraction, moonIsWaxing } from '@/lib/solar';

// NAOJ 暦計算室, 月の出入り＠東京 2026年10月 (fetched 2026-09-24): Tokyo 35.6581° N 139.7414° E,
// times in JST, the age at noon.
const tokyo = { latitude: 35.6581, longitude: 139.7414 };
const jstMidnight = (day: number) => new Date(Date.UTC(2026, 9, day) - 9 * 3600000);
const jst = (day: number, hour: number, minute: number) => new Date(Date.UTC(2026, 9, day, hour, minute) - 9 * 3600000);
const minutesApart = (a: Date | null, b: Date) => Math.abs((a?.getTime() ?? NaN) - b.getTime()) / 60000;

describe('moonrise and moonset against NAOJ', () => {
  it.each([
    [1, [20, 9], [10, 29]],
    [11, [6, 7], [17, 9]],
    [15, [10, 15], [19, 36]],
    [24, [15, 34], [3, 29]],
    [30, [20, 6], [10, 32]],
  ] as const)('October %i', (day, rise, set) => {
    const times = getMoonTimes(jstMidnight(day), tokyo.latitude, tokyo.longitude);
    // The published times are to the minute; the low-precision position adds up to about two.
    expect(minutesApart(times.moonrise, jst(day, rise[0], rise[1]))).toBeLessThanOrEqual(3);
    expect(minutesApart(times.moonset, jst(day, set[0], set[1]))).toBeLessThanOrEqual(3);
  });

  it('finds no moonrise on 5 October and no moonset on 20 October, as NAOJ shows', () => {
    expect(getMoonTimes(jstMidnight(5), tokyo.latitude, tokyo.longitude).moonrise).toBeNull();
    expect(getMoonTimes(jstMidnight(20), tokyo.latitude, tokyo.longitude).moonset).toBeNull();
  });

  it('refuses years outside the formulae', () => {
    expect(() => getMoonTimes(new Date(Date.UTC(2200, 0, 1)), 35, 139)).toThrow(RangeError);
  });
});

describe('the age and phase', () => {
  it.each([
    [1, 20.0],
    [11, 0.5],
    [15, 4.5],
    [24, 13.5],
  ])('matches the NAOJ age at noon on October %i', (day, age) => {
    expect(Math.abs(moonAge(jst(day, 12, 0)) - age)).toBeLessThanOrEqual(0.1);
  });

  it('is dark at new moon and lit at full, waxing between', () => {
    expect(moonIlluminatedFraction(jst(11, 12, 0))).toBeLessThan(0.02);
    expect(moonIlluminatedFraction(jst(26, 12, 0))).toBeGreaterThan(0.97);
    expect(moonIsWaxing(jst(15, 12, 0))).toBe(true);
    expect(moonIsWaxing(jst(1, 12, 0))).toBe(false);
  });
});
