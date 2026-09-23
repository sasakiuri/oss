import { describe, expect, it } from 'vitest';

import {
  MIL_RADIANS,
  MOA_RADIANS,
  NEGLIGIBLE_RESIDUAL_MM,
  angularSizeMm,
  calculateSightAdjustment,
  calculateSlant,
  clickSizeMm,
  conversionTable,
  fromMeters,
  toMeters,
  toMillimeters,
  type ClickPreset,
  type SightAdjustmentInput,
} from '@/lib/sight-adjustment';

const input = (overrides: Partial<SightAdjustmentInput> = {}): SightAdjustmentInput => ({
  distance: { value: 100, unit: 'm' },
  offsetUnit: 'cm',
  vertical: { direction: 'low', value: 5 },
  horizontal: { direction: 'right', value: 3 },
  click: { preset: '1/4-moa', customMmPer100m: 10 },
  ...overrides,
});

describe('angular units', () => {
  it('matches the published size of one MOA and one mil', () => {
    // 1 MOA is 2.9089 cm at 100 m; 1 mil is 10 cm at 100 m.
    expect(angularSizeMm(MOA_RADIANS, 100) / 10).toBeCloseTo(2.9089, 3);
    expect(angularSizeMm(MIL_RADIANS, 100) / 10).toBeCloseTo(10, 3);
    expect(angularSizeMm(MIL_RADIANS * 0.1, 100) / 10).toBeCloseTo(1, 3);
    expect(angularSizeMm(MOA_RADIANS, toMeters(100, 'yd')) / 25.4).toBeCloseTo(1.0472, 4);
  });
  it('converts between the units the form offers', () => {
    expect(toMeters(100, 'yd')).toBeCloseTo(91.44, 10);
    expect(toMeters(100, 'm')).toBe(100);
    expect(fromMeters(91.44, 'yd')).toBeCloseTo(100, 10);
    expect(toMillimeters(1, 'inch')).toBeCloseTo(25.4, 10);
    expect(toMillimeters(2.5, 'cm')).toBeCloseTo(25, 10);
  });
  it('scales click size with distance and rejects unusable click values', () => {
    expect(clickSizeMm({ preset: '1/4-moa', customMmPer100m: 10 }, 100)).toBeCloseTo(7.2722, 4);
    expect(clickSizeMm({ preset: '1/8-moa', customMmPer100m: 10 }, 100)).toBeCloseTo(3.6361, 4);
    expect(clickSizeMm({ preset: '0.1-mil', customMmPer100m: 10 }, 50)).toBeCloseTo(5, 4);
    expect(clickSizeMm({ preset: 'custom', customMmPer100m: 10 }, 200)).toBeCloseTo(20, 10);
    for (const customMmPer100m of [0, -1, NaN, Infinity])
      expect(clickSizeMm({ preset: 'custom', customMmPer100m }, 100)).toBeNaN();
    for (const distance of [0, -100, NaN, Infinity])
      expect(clickSizeMm({ preset: '1-moa', customMmPer100m: 10 }, distance)).toBeNaN();
  });
});

describe('click calculation', () => {
  it('turns the turret against the impact and rounds to whole clicks', () => {
    const result = calculateSightAdjustment(input())!;
    expect(result.clickSizeMm).toBeCloseTo(7.2722, 4);
    expect(result.clickSizeInch).toBeCloseTo(0.2863, 4);
    // 50 mm low is 6.875 clicks of 1/4 MOA, so seven clicks UP overshoot by 0.905 mm.
    expect(result.vertical).toMatchObject({ turn: 'up', clicks: 7, residualImpact: 'high' });
    expect(result.vertical!.exactClicks).toBeCloseTo(6.8755, 4);
    expect(result.vertical!.residualMm).toBeCloseTo(-0.9054, 4);
    // 30 mm right is 4.125 clicks, so four clicks LEFT leave 0.911 mm right.
    expect(result.horizontal).toMatchObject({ turn: 'left', clicks: 4, residualImpact: 'right' });
    expect(result.horizontal!.residualMm).toBeCloseTo(0.91118, 4);
  });
  it('keeps every impact direction paired with the opposite turret direction', () => {
    const turns = (['high', 'low'] as const).map(
      (direction) => calculateSightAdjustment(input({ vertical: { direction, value: 5 } }))!.vertical!.turn,
    );
    expect(turns).toEqual(['down', 'up']);
    const sides = (['right', 'left'] as const).map(
      (direction) => calculateSightAdjustment(input({ horizontal: { direction, value: 3 } }))!.horizontal!.turn,
    );
    expect(sides).toEqual(['left', 'right']);
  });
  it('mixes a yard distance with a centimetre error', () => {
    const result = calculateSightAdjustment(input({ distance: { value: 100, unit: 'yd' } }))!;
    expect(result.distanceMeters).toBeCloseTo(91.44, 10);
    expect(result.clickSizeMm).toBeCloseTo(6.6497, 4);
    expect(result.vertical).toMatchObject({ turn: 'up', clicks: 8, residualImpact: 'high' });
    expect(result.vertical!.exactClicks).toBeCloseTo(7.5191, 4);
    expect(result.vertical!.residualMm).toBeCloseTo(-3.19764, 4);
  });
  it('reports no residual when the error is a whole number of clicks', () => {
    const result = calculateSightAdjustment(
      input({ click: { preset: 'custom', customMmPer100m: 10 }, vertical: { direction: 'low', value: 5 } }),
    )!;
    expect(result.clickSizeMm).toBe(10);
    expect(result.vertical).toMatchObject({ clicks: 5, residualMm: 0, residualImpact: null });
  });
  it('keeps a residual too small to display exact in the number but silent in the direction', () => {
    // 0.1 mil clicks at 100 m are 10 mm plus a rounding tail, which must not read as "about 0 mm off".
    const tail = calculateSightAdjustment(input({ click: { preset: '0.1-mil', customMmPer100m: 10 } }))!.vertical!;
    expect(tail.clicks).toBe(5);
    expect(tail.residualMm).not.toBe(0);
    expect(Math.abs(tail.residualMm)).toBeLessThan(NEGLIGIBLE_RESIDUAL_MM);
    expect(tail.residualImpact).toBeNull();
    const below = calculateSightAdjustment(input({ click: { preset: 'custom', customMmPer100m: 9.9995 } }))!.vertical!;
    expect(below.residualMm).toBeCloseTo(0.0025, 6);
    expect(below.residualImpact).toBeNull();
    const above = calculateSightAdjustment(input({ click: { preset: 'custom', customMmPer100m: 9.998 } }))!.vertical!;
    expect(above.residualMm).toBeCloseTo(0.01, 6);
    expect(above.residualImpact).toBe('low');
  });
  it('treats a centred axis as zero clicks and keeps the other axis usable', () => {
    const centred = calculateSightAdjustment(input({ vertical: { direction: 'high', value: 0 } }))!;
    expect(centred.vertical).toMatchObject({ clicks: 0, residualMm: 0, residualImpact: null });
    const drafting = calculateSightAdjustment(input({ vertical: { direction: 'low', value: NaN } }))!;
    expect(drafting.vertical).toBeNull();
    expect(drafting.horizontal).toMatchObject({ turn: 'left', clicks: 4 });
    expect(calculateSightAdjustment(input({ horizontal: { direction: 'right', value: -3 } }))!.horizontal).toBeNull();
  });
  it('returns nothing without a usable distance or click value', () => {
    for (const value of [0, -100, NaN, Infinity])
      expect(calculateSightAdjustment(input({ distance: { value, unit: 'm' } }))).toBeNull();
    for (const customMmPer100m of [0, -5, NaN])
      expect(calculateSightAdjustment(input({ click: { preset: 'custom', customMmPer100m } }))).toBeNull();
  });
  it('accepts every click preset the form offers', () => {
    const presets: ClickPreset[] = ['1/8-moa', '1/4-moa', '1/2-moa', '1-moa', '0.05-mil', '0.1-mil', 'custom'];
    for (const preset of presets) {
      const result = calculateSightAdjustment(input({ click: { preset, customMmPer100m: 10 } }))!;
      expect(result.clickSizeMm).toBeGreaterThan(0);
      expect(result.vertical!.clicks).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('incline and unit table', () => {
  it('converts a slant distance to its horizontal distance', () => {
    expect(calculateSlant(100, 'm', 0)).toMatchObject({ horizontalMeters: 100, cosine: 1, reductionMeters: 0 });
    expect(calculateSlant(100, 'm', 30)!.horizontalMeters).toBeCloseTo(86.6025, 4);
    expect(calculateSlant(100, 'm', 60)!.horizontalMeters).toBeCloseTo(50, 10);
    expect(calculateSlant(100, 'm', 60)!.reductionMeters).toBeCloseTo(50, 10);
    // Shooting downhill is entered as a negative angle and gives the same horizontal distance.
    expect(calculateSlant(100, 'm', -30)!.horizontalMeters).toBeCloseTo(86.6025, 4);
    expect(calculateSlant(100, 'yd', 60)!.horizontalMeters).toBeCloseTo(45.72, 10);
  });
  it('rejects impossible slant distances and angles', () => {
    for (const value of [0, -100, NaN, Infinity]) expect(calculateSlant(value, 'm', 30)).toBeNull();
    for (const angle of [91, -91, NaN, Infinity]) expect(calculateSlant(100, 'm', angle)).toBeNull();
  });
  it('lists one MOA, one mil and one click at the chosen distance', () => {
    const rows = conversionTable({ preset: '1/4-moa', customMmPer100m: 10 }, 100);
    expect(rows.map((row) => row.key)).toEqual(['moa', 'mil', 'click']);
    expect(rows[0]).toMatchObject({ key: 'moa' });
    expect(rows[0]!.mm).toBeCloseTo(29.0888, 4);
    expect(rows[1]!.mm).toBeCloseTo(100, 3);
    expect(rows[2]!.mm).toBeCloseTo(7.2722, 4);
    for (const row of rows) expect(row.inch).toBeCloseTo(row.mm / 25.4, 10);
  });
});
