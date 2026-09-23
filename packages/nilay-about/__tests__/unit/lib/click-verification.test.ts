import { describe, expect, it } from 'vitest';

import {
  CONTENT_BOTTOM_MM,
  MAX_PAGES,
  angleToRadians,
  calculateClickVerification,
  clickUnit,
  convertDistance,
  convertLength,
  expectedTravelMm,
  paperY,
  tallTargetLayout,
  tallTargetTicks,
  type ClickVerificationSettings,
} from '@/lib/click-verification';

const settings = (overrides: Partial<ClickVerificationSettings> = {}): ClickVerificationSettings => ({
  distance: { value: 100, unit: 'm' },
  click: '1/4-moa',
  dial: 30,
  measureUnit: 'mm',
  measured: 860,
  lateral: { value: 0, side: 'right' },
  ...overrides,
});

const expectedInchesPerUnit = (
  distance: ClickVerificationSettings['distance'],
  click: ClickVerificationSettings['click'],
) => {
  // A tiny dial keeps tan(angle) equal to the angle well past the constants' last digit.
  const result = calculateClickVerification(settings({ distance, click, dial: 0.001 }));
  return (result!.expectedMm / 25.4) * 1000;
};

describe('angles', () => {
  it('uses π/10800 rad for a MOA and 1/1000 rad for a mil', () => {
    expect(angleToRadians(60, 'moa')).toBeCloseTo(Math.PI / 180, 12);
    expect(angleToRadians(10, 'mil')).toBe(0.01);
    expect(clickUnit('1/8-moa')).toBe('moa');
    expect(clickUnit('0.05-mil')).toBe('mil');
  });

  it('reproduces the constants of the tall target worksheet', () => {
    // The worksheet lists inches per unit of dial per unit of range: 0.01047, 0.03599, 0.01145, 0.03936.
    expect(expectedInchesPerUnit({ value: 1, unit: 'yd' }, '1-moa')).toBeCloseTo(0.01047, 5);
    expect(expectedInchesPerUnit({ value: 1, unit: 'yd' }, '0.1-mil')).toBeCloseTo(0.03599, 4);
    expect(expectedInchesPerUnit({ value: 1, unit: 'm' }, '1-moa')).toBeCloseTo(0.01145, 5);
    expect(expectedInchesPerUnit({ value: 1, unit: 'm' }, '0.1-mil')).toBeCloseTo(0.03936, 4);
  });
});

describe('calculateClickVerification', () => {
  it('matches the worked example of the worksheet', () => {
    // 30 MOA at 102 yd: 93.2688 m × tan(0.00872665 rad) = 813.94 mm = 32.045 in; 32.045 ÷ 29.8 = 1.0753.
    const result = calculateClickVerification(
      settings({ distance: { value: 102, unit: 'yd' }, measureUnit: 'inch', measured: 29.8 }),
    );
    expect(result!.expectedMm).toBeCloseTo(813.944, 2);
    expect(result!.expectedMm / 25.4).toBeCloseTo(32.045, 3);
    expect(result!.correctionFactor).toBeCloseTo(1.0753, 4);
    // The worksheet then dials 30 MOA × 1.075 = 32.25 MOA to get 30 MOA.
    expect(30 * result!.correctionFactor).toBeCloseTo(32.26, 2);
  });

  it('derives every figure from the expected and the measured travel', () => {
    // 30 MOA at 100 m: 100 000 mm × tan(0.00872665) = 872.687 mm.
    const result = calculateClickVerification(settings())!;
    expect(result.expectedMm).toBeCloseTo(872.687, 3);
    expect(result.measuredMm).toBe(860);
    expect(result.correctionFactor).toBeCloseTo(1.014752, 6);
    expect(result.trackingRatio).toBeCloseTo(0.985462, 6);
    expect(result.correctionFactor * result.trackingRatio).toBeCloseTo(1, 12);
    expect(result.errorPercent).toBeCloseTo(-1.4538, 4);
    expect(result.effectiveClick).toBeCloseTo(0.246366, 6);
    expect(result.nominalClick).toBe(0.25);
    expect(result.clicksDialled).toBe(120);
    expect(result.percentPerMm).toBeCloseTo(0.114589, 6);
    expect(result.tiltDegrees).toBeNull();
    expect(result.tiltSide).toBeNull();
    expect(result.unit).toBe('moa');
  });

  it('uses the tangent rather than the small-angle product', () => {
    // 10 mil at 100 m: tan(0.01) = 0.0100003333, so 1000.033 mm rather than 1000 mm.
    const result = calculateClickVerification(settings({ click: '0.1-mil', dial: 10, measured: 1000 }))!;
    expect(result.expectedMm).toBeCloseTo(1000.0333, 4);
    expect(result.clicksDialled).toBeCloseTo(100, 12);
    expect(result.errorPercent).toBeCloseTo(-0.003333, 6);
  });

  it('reads the measurement in its own unit', () => {
    const inMm = calculateClickVerification(settings({ measured: 860 }))!;
    const inCm = calculateClickVerification(settings({ measureUnit: 'cm', measured: 86 }))!;
    expect(inCm.correctionFactor).toBeCloseTo(inMm.correctionFactor, 12);
    const inYards = calculateClickVerification(settings({ distance: { value: 100, unit: 'yd' } }))!;
    expect(inYards.distanceMeters).toBeCloseTo(91.44, 12);
  });

  it('marks a turret that moves more than labelled as a positive error', () => {
    const result = calculateClickVerification(settings({ click: '0.1-mil', dial: 10, measured: 1050 }))!;
    expect(result.errorPercent).toBeGreaterThan(0);
    expect(result.correctionFactor).toBeLessThan(1);
    expect(result.effectiveClick).toBeCloseTo((0.1 * 1050) / 1000.0333, 6);
  });

  it('turns a sideways offset into a tilt', () => {
    expect(
      calculateClickVerification(settings({ measured: 1000, lateral: { value: 1000, side: 'left' } }))!.tiltDegrees,
    ).toBeCloseTo(45, 12);
    const small = calculateClickVerification(settings({ measured: 860, lateral: { value: 15, side: 'right' } }))!;
    // atan(15 / 860) = atan(0.017442) = 0.017440 rad = 0.99924°.
    expect(small.tiltDegrees).toBeCloseTo(0.99924, 5);
    expect(small.tiltSide).toBe('right');
    // A blank offset drops only the tilt.
    const blank = calculateClickVerification(settings({ lateral: { value: NaN, side: 'right' } }))!;
    expect(blank.tiltDegrees).toBeNull();
    expect(blank.correctionFactor).toBeGreaterThan(0);
  });

  it('gives nothing without a distance, a dial or a measurement', () => {
    expect(calculateClickVerification(settings({ distance: { value: 0, unit: 'm' } }))).toBeNull();
    expect(calculateClickVerification(settings({ distance: { value: NaN, unit: 'm' } }))).toBeNull();
    expect(calculateClickVerification(settings({ dial: 0 }))).toBeNull();
    expect(calculateClickVerification(settings({ dial: -5 }))).toBeNull();
    expect(calculateClickVerification(settings({ measured: 0 }))).toBeNull();
    expect(calculateClickVerification(settings({ measured: NaN }))).toBeNull();
    // 5400 MOA is 90°, which never meets a flat target.
    expect(calculateClickVerification(settings({ click: '1-moa', dial: 5400 }))).toBeNull();
  });
});

describe('expectedTravelMm', () => {
  it('needs only the distance and the dial, so the target exists before any shot', () => {
    // 30 MOA at 100 m, the same 872.687 mm the full calculation gives.
    expect(expectedTravelMm({ value: 100, unit: 'm' }, '1/4-moa', 30)).toBeCloseTo(872.687, 3);
    expect(calculateClickVerification(settings({ measured: NaN }))).toBeNull();
    expect(expectedTravelMm({ value: 0, unit: 'm' }, '1/4-moa', 30)).toBeNull();
    expect(expectedTravelMm({ value: 100, unit: 'm' }, '1/4-moa', NaN)).toBeNull();
    expect(expectedTravelMm({ value: 100, unit: 'm' }, '1-moa', 5400)).toBeNull();
  });
});

describe('unit conversion', () => {
  it('keeps the same distance in the other unit', () => {
    // 100 m ÷ 0.9144 = 109.36133 yd, kept to four decimals; back again is 99.99997 m, which rounds to 100.
    expect(convertDistance(100, 'm', 'yd')).toBe(109.3613);
    expect(convertDistance(109.3613, 'yd', 'm')).toBe(100);
    expect(convertDistance(100, 'yd', 'm')).toBe(91.44);
    expect(convertDistance(100, 'm', 'm')).toBe(100);
    expect(convertDistance(NaN, 'm', 'yd')).toBeNaN();
  });

  it('keeps the same length on the target in the other unit', () => {
    // 860 mm = 86 cm = 860 ÷ 25.4 = 33.85827 in.
    expect(convertLength(860, 'mm', 'cm')).toBe(86);
    expect(convertLength(860, 'mm', 'inch')).toBe(33.8583);
    expect(convertLength(29.8, 'inch', 'mm')).toBe(756.92);
    expect(convertLength(86, 'cm', 'mm')).toBe(860);
    expect(convertLength(NaN, 'cm', 'mm')).toBeNaN();
  });
});

describe('tallTargetLayout', () => {
  it('sizes the target from the expected travel and splits it over sheets', () => {
    // 872.687 × 1.1 + 30 = 989.96 mm, which needs five 240 mm segments.
    const layout = tallTargetLayout(872.6867790758789)!;
    expect(layout.heightMm).toBeCloseTo(989.955, 3);
    expect(layout.pageCount).toBe(5);
    expect(layout.fits).toBe(true);
    expect(layout.pages[0]).toEqual({ index: 0, startMm: -15, endMm: 240, joinBelowMm: null, joinAboveMm: 240 });
    expect(layout.pages[1]).toMatchObject({ startMm: 225, endMm: 480, joinBelowMm: 240, joinAboveMm: 480 });
    expect(layout.pages).toHaveLength(5);
    const lastPage = layout.pages[4]!;
    expect(lastPage.startMm).toBe(945);
    expect(lastPage.endMm).toBeCloseTo(989.955, 3);
    expect(lastPage.joinAboveMm).toBeNull();
  });

  it('adds a sheet only once a segment is full', () => {
    // A target exactly 240 mm tall is one sheet: expected = (240 − 30) ÷ 1.1.
    expect(tallTargetLayout(210 / 1.1)!.pageCount).toBe(1);
    expect(tallTargetLayout(210 / 1.1 + 0.01)!.pageCount).toBe(2);
    expect(tallTargetLayout(1)!.pageCount).toBe(1);
  });

  it('refuses a target taller than the sheet limit', () => {
    const limit = (MAX_PAGES * 240 - 30) / 1.1;
    expect(tallTargetLayout(limit)!.fits).toBe(true);
    const over = tallTargetLayout(limit + 0.01)!;
    expect(over.fits).toBe(false);
    expect(over.pageCount).toBe(MAX_PAGES + 1);
    expect(over.pages).toEqual([]);
  });

  it('gives nothing without a positive expected travel', () => {
    expect(tallTargetLayout(0)).toBeNull();
    expect(tallTargetLayout(NaN)).toBeNull();
  });

  it('places heights on the paper and ticks every millimetre from the aim point', () => {
    const { pages } = tallTargetLayout(872.6867790758789)!;
    expect(pages.length).toBeGreaterThanOrEqual(2);
    const first = pages[0]!;
    const second = pages[1]!;
    expect(paperY(first, -15)).toBe(CONTENT_BOTTOM_MM);
    expect(paperY(first, 0)).toBe(252);
    expect(paperY(first, 240)).toBe(12);
    expect(paperY(second, 240)).toBe(252);
    const ticks = tallTargetTicks(first);
    expect(ticks).toHaveLength(241);
    expect(ticks[0]).toEqual({ heightMm: 0, lengthMm: 10, labelled: true });
    expect(ticks[1]).toEqual({ heightMm: 1, lengthMm: 3, labelled: false });
    expect(ticks[5]).toEqual({ heightMm: 5, lengthMm: 6, labelled: false });
    const secondTicks = tallTargetTicks(second);
    expect(secondTicks.length).toBeGreaterThan(0);
    expect(secondTicks[0]!.heightMm).toBe(225);
    expect(secondTicks.at(-1)!.heightMm).toBe(480);
  });
});
