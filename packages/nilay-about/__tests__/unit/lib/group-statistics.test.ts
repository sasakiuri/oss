import { describe, expect, it } from 'vitest';

import {
  AXIS_RATIO_CAUTION,
  COMPARISON_GROUP_SIZES,
  PUBLISHED_GROUP_SIZE_LIMIT,
  REQUIRED_SHOTS_LIMIT,
  chiSquaredCdf,
  chiSquaredQuantile,
  expectedExtremeSpread,
  gaussianCorrection,
  logGamma,
  requiredShots,
  studentTCdf,
  studentTQuantile,
  summariseStatistics,
} from '@/lib/group-statistics';
import type { ShotImpact } from '@/lib/schemas/shot-group';

/**
 * Critical values of Student's t, from NIST/SEMATECH e-Handbook of Statistical Methods,
 * 1.3.6.7.2 "Critical Values of the Student's t Distribution" (retrieved 2026-09-22).
 * The handbook prints three decimals, which is what the tolerance below allows for.
 */
const NIST_T_975: Record<number, number> = {
  1: 12.706,
  2: 4.303,
  3: 3.182,
  4: 2.776,
  5: 2.571,
  6: 2.447,
  7: 2.365,
  8: 2.306,
  9: 2.262,
  10: 2.228,
  12: 2.179,
  15: 2.131,
  20: 2.086,
  24: 2.064,
  30: 2.042,
  40: 2.021,
  60: 2.0,
  100: 1.984,
};

/** The same handbook's 0.95 and 0.99 columns, to check a level other than the one the tool uses. */
const NIST_T_95: Record<number, number> = { 1: 6.314, 2: 2.92, 5: 2.015, 10: 1.812, 20: 1.725 };
const NIST_T_99: Record<number, number> = { 1: 31.821, 5: 3.365, 10: 2.764, 20: 2.528 };

/**
 * Critical values of χ², from the same handbook, 1.3.6.7.4, upper-tail table (0.975 column) and
 * lower-tail table (0.025 column), retrieved 2026-09-22.
 */
const NIST_CHI2_975: Record<number, number> = { 2: 7.378, 4: 11.143, 6: 14.449, 10: 20.483, 20: 34.17, 38: 56.896 };
const NIST_CHI2_025: Record<number, number> = { 2: 0.051, 4: 0.484, 6: 1.237, 10: 3.247, 20: 9.591, 38: 22.878 };

describe('distribution functions against published critical values', () => {
  it('reproduces the t table the handbook prints', () => {
    for (const [df, published] of Object.entries(NIST_T_975))
      expect(studentTQuantile(0.975, Number(df))).toBeCloseTo(published, 3);
    for (const [df, published] of Object.entries(NIST_T_95))
      expect(studentTQuantile(0.95, Number(df))).toBeCloseTo(published, 3);
    for (const [df, published] of Object.entries(NIST_T_99))
      expect(studentTQuantile(0.99, Number(df))).toBeCloseTo(published, 3);
  });
  it('reproduces the χ² table the handbook prints', () => {
    for (const [df, published] of Object.entries(NIST_CHI2_975))
      expect(chiSquaredQuantile(0.975, Number(df))).toBeCloseTo(published, 3);
    for (const [df, published] of Object.entries(NIST_CHI2_025))
      expect(chiSquaredQuantile(0.025, Number(df))).toBeCloseTo(published, 3);
  });
  it('inverts its own distribution functions', () => {
    for (const df of [1, 3, 8, 25]) {
      for (const p of [0.05, 0.25, 0.5, 0.75, 0.95, 0.999]) {
        expect(studentTCdf(studentTQuantile(p, df), df)).toBeCloseTo(p, 10);
        expect(chiSquaredCdf(chiSquaredQuantile(p, df), df)).toBeCloseTo(p, 10);
      }
    }
  });
  it('keeps the t distribution symmetric about zero', () => {
    expect(studentTQuantile(0.025, 7)).toBeCloseTo(-studentTQuantile(0.975, 7), 12);
    expect(studentTCdf(0, 4)).toBeCloseTo(0.5, 12);
    expect(studentTQuantile(0.5, 4)).toBe(0);
  });
  it('matches the factorial for whole arguments of the gamma function', () => {
    // ln Γ(n) = ln (n-1)!, which is the cheapest independent check on the approximation.
    expect(Math.exp(logGamma(1))).toBeCloseTo(1, 10);
    expect(Math.exp(logGamma(5))).toBeCloseTo(24, 8);
    expect(Math.exp(logGamma(9))).toBeCloseTo(40320, 4);
    // Γ(1/2) = √π, which exercises the half-integer arguments the two distributions use.
    expect(Math.exp(logGamma(0.5))).toBeCloseTo(Math.sqrt(Math.PI), 10);
  });
  it('refuses input that has no answer', () => {
    for (const p of [0, 1, -0.5, Number.NaN]) {
      expect(studentTQuantile(p, 5)).toBeNaN();
      expect(chiSquaredQuantile(p, 5)).toBeNaN();
    }
    expect(studentTQuantile(0.975, 0)).toBeNaN();
    expect(chiSquaredQuantile(0.975, -2)).toBeNaN();
  });
  it('corrects the bias of a standard deviation as the published factor does', () => {
    // Ballistipedia, "Closed Form Precision": c_G is above one everywhere and falls towards one.
    // c₄(5) = √(2/4) Γ(2.5)/Γ(2) = 0.9400, so c_G(5) is its reciprocal.
    expect(gaussianCorrection(5)).toBeCloseTo(1 / 0.93999, 4);
    expect(gaussianCorrection(3)).toBeGreaterThan(gaussianCorrection(10));
    expect(gaussianCorrection(200)).toBeCloseTo(1, 2);
    expect(gaussianCorrection(1)).toBeNaN();
  });
});

/** An equilateral triangle of the given side, the shape of the worked example in the source. */
const equilateralGroup = (side: number): ShotImpact[] => [
  { x: 0, y: 0 },
  { x: side, y: 0 },
  { x: side / 2, y: (side * Math.sqrt(3)) / 2 },
];

describe('the Rayleigh estimate of a group', () => {
  it('reproduces the three-shot group worked through in the source', () => {
    // Ballistipedia, "Closed Form Precision", section "The 3-shot Group": three holes half an inch
    // apart give σ̂ ≈ 0.25 MOA, and a 90% interval of roughly 0.16 to 0.59. The lengths there are
    // inches at 100 yards; the arithmetic does not know that, so they are read here as millimetres.
    const statistics = summariseStatistics(equilateralGroup(0.5), { level: 0.9 })!;
    expect(statistics.count).toBe(3);
    expect(statistics.sigmaMm).toBeCloseTo(0.266, 3);
    expect(statistics.sigmaLowMm).toBeCloseTo(0.162, 3);
    expect(statistics.sigmaHighMm).toBeCloseTo(0.593, 3);
    // Each shot sits 1/(2√3) from the centre, which is the radius the source quotes as 0.29.
    expect(statistics.sampleMeanRadiusMm).toBeGreaterThan(0);
    expect(statistics.axisRatio).toBeLessThan(AXIS_RATIO_CAUTION);
    expect(statistics.circularModelDoubtful).toBe(false);
  });
  it('scales with the group, as an estimate in the units of the target must', () => {
    const small = summariseStatistics(equilateralGroup(10))!;
    const large = summariseStatistics(equilateralGroup(30))!;
    expect(large.sigmaMm).toBeCloseTo(small.sigmaMm * 3, 10);
    expect(large.meanRadiusMm).toBeCloseTo(small.meanRadiusMm * 3, 10);
  });
  it('relates the mean radius to σ as the closed form does', () => {
    const statistics = summariseStatistics(equilateralGroup(20))!;
    expect(statistics.meanRadiusMm).toBeCloseTo(statistics.sigmaMm * Math.sqrt(Math.PI / 2), 12);
    // A group of n shots measures its radii from its own centre, so it reads low by √((n-1)/n).
    expect(statistics.sampleMeanRadiusMm).toBeCloseTo(statistics.meanRadiusMm * Math.sqrt(2 / 3), 12);
    expect(statistics.sampleMeanRadiusMm).toBeLessThan(statistics.meanRadiusMm);
  });
  it('brackets the estimate with an interval that narrows as shots are added', () => {
    const wide = summariseStatistics(equilateralGroup(20))!;
    const many = summariseStatistics(
      Array.from({ length: 30 }, (_, index) => ({ x: Math.cos(index) * 10, y: Math.sin(index) * 10 })),
    )!;
    expect(wide.sigmaLowMm).toBeLessThan(wide.sigmaMm);
    expect(wide.sigmaHighMm).toBeGreaterThan(wide.sigmaMm);
    const width = (statistics: { sigmaLowMm: number; sigmaHighMm: number; sigmaMm: number }) =>
      (statistics.sigmaHighMm - statistics.sigmaLowMm) / statistics.sigmaMm;
    expect(width(many)).toBeLessThan(width(wide));
  });
  it('notices a group that is not round', () => {
    const tall = summariseStatistics([
      { x: 0, y: -30 },
      { x: 1, y: 0 },
      { x: -1, y: 31 },
      { x: 0, y: -14 },
    ])!;
    expect(tall.axisRatio).toBeGreaterThan(AXIS_RATIO_CAUTION);
    expect(tall.circularModelDoubtful).toBe(true);
  });
});

describe('the interval on the mean point of impact', () => {
  it('measures the interval as t × s / √n', () => {
    // Four shots at 10, 12, 14 and 16 mm to the right: mean 13, s = 2.5820, t(0.975, 3) = 3.182.
    const statistics = summariseStatistics([
      { x: 10, y: 0 },
      { x: 12, y: 0 },
      { x: 14, y: 0 },
      { x: 16, y: 0 },
    ])!;
    expect(statistics.horizontal.meanMm).toBeCloseTo(13, 12);
    expect(statistics.horizontal.sdMm).toBeCloseTo(2.582, 3);
    expect(statistics.horizontal.halfWidthMm).toBeCloseTo(4.1085, 4);
    expect(statistics.horizontal.lowMm).toBeCloseTo(8.8915, 4);
    expect(statistics.horizontal.highMm).toBeCloseTo(17.1085, 4);
    expect(statistics.horizontal.spansZero).toBe(false);
  });
  it('reaches across zero when the group is not far enough off the aim point', () => {
    const statistics = summariseStatistics([
      { x: -6, y: 0 },
      { x: 8, y: 0 },
      { x: -4, y: 0 },
      { x: 6, y: 0 },
    ])!;
    expect(statistics.horizontal.meanMm).toBeCloseTo(1, 12);
    expect(statistics.horizontal.spansZero).toBe(true);
    expect(statistics.horizontal.lowMm).toBeLessThan(0);
    expect(statistics.horizontal.highMm).toBeGreaterThan(0);
  });
  it('narrows as the same scatter is measured with more shots', () => {
    const alternating = (count: number) =>
      Array.from({ length: count }, (_, index) => ({ x: (index % 2 === 0 ? -9 : 9) + 20, y: 0 }));
    const wide = summariseStatistics(alternating(4))!;
    const narrow = summariseStatistics(alternating(16))!;
    // The same scatter measured four times over: the deviation barely moves - the divisor of n - 1
    // keeps it from being identical - while the interval on the centre closes by more than a third.
    expect(narrow.horizontal.sdMm / wide.horizontal.sdMm).toBeCloseTo(0.89, 2);
    expect(narrow.horizontal.halfWidthMm).toBeLessThan(wide.horizontal.halfWidthMm * 0.6);
  });
  it('marks an axis with no spread rather than claiming the centre exactly', () => {
    const statistics = summariseStatistics([
      { x: 5, y: 1 },
      { x: 5, y: -1 },
    ])!;
    expect(statistics.horizontal.sdMm).toBe(0);
    expect(statistics.horizontal.halfWidthMm).toBe(0);
    expect(statistics.horizontal.degenerate).toBe(true);
    expect(statistics.vertical.degenerate).toBe(false);
  });
  it('holds a level other than the default and widens with it', () => {
    const group = equilateralGroup(20);
    const ninety = summariseStatistics(group, { level: 0.9 })!;
    const ninetyNine = summariseStatistics(group, { level: 0.99 })!;
    expect(ninetyNine.horizontal.halfWidthMm).toBeGreaterThan(ninety.horizontal.halfWidthMm);
    expect(ninetyNine.sigmaHighMm).toBeGreaterThan(ninety.sigmaHighMm);
  });
});

describe('statistics of a group that cannot carry them', () => {
  it('has nothing to say before the second shot', () => {
    expect(summariseStatistics([])).toBeNull();
    expect(summariseStatistics([{ x: 3, y: 4 }])).toBeNull();
  });
  it('leaves out coordinates that are not numbers', () => {
    const statistics = summariseStatistics([
      { x: 10, y: 0 },
      { x: Number.NaN, y: 4 },
      { x: 14, y: 0 },
      { x: 3, y: Infinity },
    ])!;
    expect(statistics.count).toBe(2);
    expect(statistics.horizontal.meanMm).toBe(12);
  });
  it('refuses a confidence level that is not a probability', () => {
    for (const level of [0, 1, -1, Number.NaN]) expect(summariseStatistics(equilateralGroup(10), { level })).toBeNull();
  });
  it('survives every shot through one hole', () => {
    const statistics = summariseStatistics([
      { x: 4, y: 4 },
      { x: 4, y: 4 },
      { x: 4, y: 4 },
    ])!;
    expect(statistics.sigmaMm).toBe(0);
    expect(statistics.meanRadiusMm).toBe(0);
    expect(statistics.horizontal.degenerate).toBe(true);
    expect(statistics.axisRatio).toBe(1);
  });
});

describe('the published distribution of the extreme spread', () => {
  it('matches the examples worked through in the source', () => {
    // "Range Statistics", example 1: a rifle of σ = ½ MOA has a five-shot median of 3.0 σ, and the
    // middle half of its groups falls between 1.2 and 1.8 MOA, 95% of them between 0.8 and 2.4.
    const five = expectedExtremeSpread(0.5, 5)!;
    // The source rounds its own table to one decimal in the worked example, so its 3.0 σ median
    // is checked as it prints it and the figures below are checked against the table itself.
    expect(expectedExtremeSpread(1, 5)!.medianMm).toBeCloseTo(3.0, 1);
    expect(five.medianMm).toBeCloseTo(1.506, 3);
    expect(five.p25Mm).toBeCloseTo(1.24, 2);
    expect(five.p75Mm).toBeCloseTo(1.796, 3);
    expect(five.p025Mm).toBeCloseTo(0.803, 3);
    expect(five.p975Mm).toBeCloseTo(2.416, 3);
    // Example 2: ten-shot groups average 1.24 times the five-shot average of the same rifle.
    expect(expectedExtremeSpread(1, 10)!.meanMm / expectedExtremeSpread(1, 5)!.meanMm).toBeCloseTo(1.24, 2);
  });
  it('grows with the number of shots, which is the point of showing it', () => {
    const means = [3, 5, 10, 20].map((size) => expectedExtremeSpread(10, size)!.meanMm);
    means.slice(1).forEach((mean, index) => expect(mean).toBeGreaterThan(means[index]!));
    // A three-shot group reads about two thirds of a ten-shot group from the same rifle.
    expect(means[0]! / means[2]!).toBeCloseTo(0.632, 3);
  });
  it('scales with σ and stops where the transcribed table stops', () => {
    expect(expectedExtremeSpread(4, 5)!.meanMm).toBeCloseTo(expectedExtremeSpread(1, 5)!.meanMm * 4, 10);
    expect(expectedExtremeSpread(1, PUBLISHED_GROUP_SIZE_LIMIT)).not.toBeNull();
    expect(expectedExtremeSpread(1, PUBLISHED_GROUP_SIZE_LIMIT + 1)).toBeNull();
    expect(expectedExtremeSpread(1, 1)).toBeNull();
    expect(expectedExtremeSpread(Number.NaN, 5)).toBeNull();
    // Every size the screen compares against has to be in the table.
    for (const size of COMPARISON_GROUP_SIZES) expect(expectedExtremeSpread(1, size)).not.toBeNull();
  });
  it('orders its bands, so a screen can print them as a range', () => {
    const expectation = expectedExtremeSpread(10, 5)!;
    expect(expectation.p025Mm).toBeLessThan(expectation.p25Mm);
    expect(expectation.p25Mm).toBeLessThan(expectation.medianMm);
    expect(expectation.medianMm).toBeLessThan(expectation.p75Mm);
    expect(expectation.p75Mm).toBeLessThan(expectation.p975Mm);
    // The extreme spread is skewed to the high side, so the mean sits above the median.
    expect(expectation.meanMm).toBeGreaterThan(expectation.medianMm);
  });
});

describe('how many shots the next answer needs', () => {
  it('counts up to the first group size whose interval is tight enough', () => {
    // s = 10 mm, ±5 mm: 18 shots give 2.110 × 10 / √18 = 4.97, while 17 still leave 5.14.
    expect(requiredShots(10, 5)).toBe(18);
    expect((studentTQuantile(0.975, 16) * 10) / Math.sqrt(17)).toBeGreaterThan(5);
    expect((studentTQuantile(0.975, 17) * 10) / Math.sqrt(18)).toBeLessThanOrEqual(5);
  });
  it('asks for more shots as the target tightens and fewer as it loosens', () => {
    expect(requiredShots(10, 20)!).toBeLessThan(requiredShots(10, 5)!);
    expect(requiredShots(20, 5)!).toBeGreaterThan(requiredShots(10, 5)!);
    // A target wider than a two-shot interval is met by the smallest group there can be.
    expect(requiredShots(1, 100)).toBe(2);
  });
  it('gives up rather than printing a number nobody will fire', () => {
    expect(requiredShots(100, 0.5)).toBeNull();
    expect((studentTQuantile(0.975, REQUIRED_SHOTS_LIMIT - 1) * 100) / Math.sqrt(REQUIRED_SHOTS_LIMIT)).toBeGreaterThan(
      0.5,
    );
  });
  it('refuses input that cannot be answered', () => {
    expect(requiredShots(10, 0)).toBeNull();
    expect(requiredShots(10, -1)).toBeNull();
    expect(requiredShots(Number.NaN, 5)).toBeNull();
    expect(requiredShots(-1, 5)).toBeNull();
    expect(requiredShots(10, 5, 1.5)).toBeNull();
  });
  it('takes a shot with no measured spread as already there', () => {
    expect(requiredShots(0, 1)).toBe(2);
  });
});
