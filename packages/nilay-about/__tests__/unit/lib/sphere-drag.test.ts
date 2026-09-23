import { describe, expect, it } from 'vitest';

import { dragFromTable, dragTableRange, type DragTable } from '@/lib/drag-table';
import { SPHERE_DRAG_TABLE_RANGE, sphereDragCoefficient, sphereFrontalAreaM2, sphereMassKg } from '@/lib/sphere-drag';

describe('reading a drag table', () => {
  const table: DragTable = [
    [0, 1],
    [1, 2],
    [3, 4],
  ];

  it('returns a published point unchanged and interpolates in a straight line between two', () => {
    expect(dragFromTable(table, 1)).toBe(2);
    expect(dragFromTable(table, 0.25)).toBeCloseTo(1.25, 12);
    expect(dragFromTable(table, 2)).toBeCloseTo(3, 12);
  });

  it('holds the end value outside the measured range and reports that range', () => {
    expect(dragFromTable(table, -5)).toBe(1);
    expect(dragFromTable(table, 99)).toBe(4);
    expect(dragTableRange(table)).toEqual({ min: 0, max: 3 });
  });

  it('has nothing to say about a table with no points or a Mach number that is not one', () => {
    expect(dragFromTable([], 1)).toBeNaN();
    expect(dragFromTable(table, NaN)).toBeNaN();
    expect(dragTableRange([])).toEqual({ min: NaN, max: NaN });
  });
});

describe('the drag of a sphere', () => {
  // Spot checks against the published file: the first row, the last, and the rows either side
  // of Mach 1, where the transonic rise makes a transcription slip easiest to see.
  it('gives the published coefficient at a published Mach number', () => {
    expect(sphereDragCoefficient(0)).toBe(0.4662);
    expect(sphereDragCoefficient(0.95)).toBe(0.7757);
    expect(sphereDragCoefficient(1)).toBe(0.814);
    expect(sphereDragCoefficient(1.05)).toBe(0.8512);
    expect(sphereDragCoefficient(4)).toBe(0.928);
  });

  it('interpolates halfway between two published points', () => {
    expect(sphereDragCoefficient(0.975)).toBeCloseTo((0.7757 + 0.814) / 2, 12);
  });

  it('runs from Mach 0 to Mach 4 and holds the end values beyond that', () => {
    expect(SPHERE_DRAG_TABLE_RANGE).toEqual({ min: 0, max: 4 });
    expect(sphereDragCoefficient(-1)).toBe(sphereDragCoefficient(0));
    expect(sphereDragCoefficient(9)).toBe(sphereDragCoefficient(4));
    expect(sphereDragCoefficient(NaN)).toBeNaN();
  });

  // A sphere is far draggier than either standard projectile, and the table has to show it:
  // it rises through the transonic range and stays near one above it, where G7 is near 0.3.
  it('rises through the transonic range and stays above the subsonic value', () => {
    const subsonic = sphereDragCoefficient(0.5);
    expect(subsonic).toBeGreaterThan(0.45);
    expect(subsonic).toBeLessThan(0.55);
    expect(sphereDragCoefficient(1.6)).toBeGreaterThan(subsonic * 1.9);
    for (let mach = 0; mach <= 1.5; mach += 0.05)
      expect(sphereDragCoefficient(mach + 0.05)).toBeGreaterThanOrEqual(sphereDragCoefficient(mach));
  });
});

describe('the size and weight of a spherical projectile', () => {
  it('measures the frontal area the coefficient is referred to', () => {
    expect(sphereFrontalAreaM2(0.002)).toBeCloseTo(Math.PI * 0.001 ** 2, 15);
    // Four times the diameter is sixteen times the area, which is what the square means.
    expect(sphereFrontalAreaM2(0.008) / sphereFrontalAreaM2(0.002)).toBeCloseTo(16, 12);
  });

  it('weighs a lead pellet of a known size', () => {
    // A 2.5 mm sphere of lead at 11 340 kg/m³: πd³/6 × density, 0.0927 g.
    expect(sphereMassKg(0.0025, 11340) * 1000).toBeCloseTo(0.0928, 4);
    // Steel is about two thirds the density of lead, and the same pellet weighs that much less.
    expect(sphereMassKg(0.0025, 7850) / sphereMassKg(0.0025, 11340)).toBeCloseTo(7850 / 11340, 12);
  });

  it('has no answer for a size or a density that is not a positive number', () => {
    expect(sphereFrontalAreaM2(0)).toBeNaN();
    expect(sphereFrontalAreaM2(NaN)).toBeNaN();
    expect(sphereMassKg(-0.002, 11340)).toBeNaN();
    expect(sphereMassKg(0.002, 0)).toBeNaN();
  });
});
