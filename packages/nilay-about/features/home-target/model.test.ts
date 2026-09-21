import { describe, expect, it } from 'vitest';

import { calculateTarget, type TargetMeasurements } from './model';

const measurements: TargetMeasurements = {
  heightOfEye: { number: 170, unit: 'cm' },
  distanceToTarget: { number: 5, unit: 'm' },
  discipline: {
    name: 'Air Rifle',
    key: 'AR10',
    distance: { number: 10, unit: 'm' },
    heightOfTarget: { number: 140, unit: 'cm' },
    blackAreaSize: { number: 3.05, unit: 'cm' },
  },
};

describe('target projection', () => {
  it('projects the height along the sight line and scales the diameter', () => {
    expect(calculateTarget(measurements)).toEqual({ heightCm: 155, diameterCm: 1.525 });
  });

  it('normalizes mixed distance, height, and diameter units to centimeters', () => {
    const result = calculateTarget({
      heightOfEye: { number: 1.7, unit: 'm' },
      distanceToTarget: { number: 5000, unit: 'mm' },
      discipline: {
        ...measurements.discipline,
        distance: { number: 1000, unit: 'cm' },
        heightOfTarget: { number: 1400, unit: 'mm' },
        blackAreaSize: { number: 0.0305, unit: 'm' },
      },
    });
    expect(result?.heightCm).toBeCloseTo(155);
    expect(result?.diameterCm).toBeCloseTo(1.525);
  });

  it('handles a target at floor height without division by zero', () => {
    expect(
      calculateTarget({
        ...measurements,
        discipline: { ...measurements.discipline, heightOfTarget: { number: 0, unit: 'cm' } },
      })?.heightCm,
    ).toBe(85);
  });

  it('returns the eye height at zero distance and the full target at full distance', () => {
    expect(calculateTarget({ ...measurements, distanceToTarget: { number: 0, unit: 'm' } })).toEqual({
      heightCm: 170,
      diameterCm: 0,
    });
    expect(calculateTarget({ ...measurements, distanceToTarget: { number: 10, unit: 'm' } })).toEqual({
      heightCm: 140,
      diameterCm: 3.05,
    });
  });

  it.each([0, -1, Infinity, NaN])('rejects invalid discipline distances (%s)', (number) => {
    expect(
      calculateTarget({ ...measurements, discipline: { ...measurements.discipline, distance: { number, unit: 'm' } } }),
    ).toBeNull();
  });

  it('rejects empty form input and overflow', () => {
    expect(calculateTarget({ ...measurements, heightOfEye: { number: NaN, unit: 'cm' } })).toBeNull();
    expect(calculateTarget({ ...measurements, distanceToTarget: { number: Number.MAX_VALUE, unit: 'm' } })).toBeNull();
  });
});
