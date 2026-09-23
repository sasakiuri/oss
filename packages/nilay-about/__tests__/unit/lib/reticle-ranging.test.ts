import { describe, expect, it } from 'vitest';

import {
  MAX_ANGLE_RADIANS,
  READING_STEP,
  SIZE_UNCERTAINTY_SHARE,
  angleForSize,
  calculateReticleRanging,
  distanceForAngle,
  fromSizeMm,
  radiansToReading,
  readingToRadians,
  reticleScale,
  sizeForAngle,
  toSizeMm,
  type ReticleRangingInput,
} from '@/lib/reticle-ranging';
import {
  METERS_PER_YARD,
  MIL_RADIANS,
  MM_PER_INCH,
  MOA_RADIANS,
  angularSizeMm,
  toMeters,
} from '@/lib/sight-adjustment';

const input = (overrides: Partial<ReticleRangingInput> = {}): ReticleRangingInput => ({
  solveFor: 'distance',
  targetSize: { value: 100, unit: 'cm' },
  apparent: { value: 2, unit: 'mil' },
  distance: { value: 500, unit: 'm' },
  focalPlane: 'ffp',
  magnification: { calibration: 10, used: 10 },
  ...overrides,
});

describe('units and the reticle scale', () => {
  it('converts target sizes between the units the form offers', () => {
    expect(toSizeMm(1, 'inch')).toBeCloseTo(MM_PER_INCH, 10);
    expect(toSizeMm(2.5, 'cm')).toBeCloseTo(25, 10);
    expect(toSizeMm(1.1, 'm')).toBeCloseTo(1100, 10);
    expect(fromSizeMm(1100, 'm')).toBeCloseTo(1.1, 10);
    expect(fromSizeMm(25.4, 'inch')).toBeCloseTo(1, 10);
  });
  it('leaves a first focal plane reticle alone and scales a second focal plane one', () => {
    expect(reticleScale('ffp', { calibration: 10, used: 4 })).toBe(1);
    // Even an unusable magnification cannot spoil an FFP reading, because the reticle does not depend on it.
    expect(reticleScale('ffp', { calibration: NaN, used: 0 })).toBe(1);
    expect(reticleScale('sfp', { calibration: 10, used: 10 })).toBe(1);
    // Half the magnification, half the image against an unchanged reticle: each graduation is worth twice as much.
    expect(reticleScale('sfp', { calibration: 10, used: 5 })).toBe(2);
    expect(reticleScale('sfp', { calibration: 12, used: 24 })).toBe(0.5);
    for (const used of [0, -4, NaN, Infinity]) expect(reticleScale('sfp', { calibration: 10, used })).toBeNaN();
    for (const calibration of [0, -10, NaN, Infinity]) expect(reticleScale('sfp', { calibration, used: 5 })).toBeNaN();
  });
  it('turns graduations into angles and back', () => {
    expect(readingToRadians(1, 'mil', 1)).toBeCloseTo(MIL_RADIANS, 12);
    expect(readingToRadians(1, 'moa', 1)).toBeCloseTo(MOA_RADIANS, 12);
    expect(readingToRadians(4, 'mil', 2)).toBeCloseTo(0.008, 12);
    expect(radiansToReading(readingToRadians(3.7, 'moa', 1.5), 'moa', 1.5)).toBeCloseTo(3.7, 10);
  });
});

describe('the mil relation', () => {
  it('matches the published size of one mil and one MOA', () => {
    // 1 mil covers 10 cm at 100 m, and 1 MOA covers 1.047 inch at 100 yd.
    const mil = calculateReticleRanging(
      input({ solveFor: 'size', apparent: { value: 1, unit: 'mil' }, distance: { value: 100, unit: 'm' } }),
    )!;
    expect(mil.sizeMm).toBeCloseTo(100, 4);
    expect(fromSizeMm(mil.sizeMm, 'cm')).toBeCloseTo(10, 5);
    const moa = calculateReticleRanging(
      input({ solveFor: 'size', apparent: { value: 1, unit: 'moa' }, distance: { value: 100, unit: 'yd' } }),
    )!;
    expect(moa.distanceMeters).toBeCloseTo(100 * METERS_PER_YARD, 10);
    expect(moa.sizeInch).toBeCloseTo(1.0472, 4);
  });
  it('agrees with "distance in metres = target height in millimetres ÷ mils"', () => {
    for (const [heightMm, mils, expectedMeters] of [
      [1000, 1, 1000],
      [1000, 2, 500],
      [450, 1.5, 300],
      [1700, 4, 425],
    ] as const) {
      const result = calculateReticleRanging(
        input({ targetSize: { value: heightMm / 10, unit: 'cm' }, apparent: { value: mils, unit: 'mil' } }),
      )!;
      expect(result.distanceMeters).toBeCloseTo(expectedMeters, 1);
    }
  });
  it('stays within a fraction of a tenth-mil of the small-angle shortcut', () => {
    // The comment in the lib claims the shortcut reads long by about x²/12, so 0.00083 % at 10 mil, which is
    // far less than the 1 % that one tenth of a mil costs there. Both halves of that claim are checked here.
    const sizeMm = 1000;
    for (const [mils, tolerance] of [
      [1, 1e-7],
      [10, 1e-5],
      [100, 1e-3],
    ] as const) {
      const exact = distanceForAngle(sizeMm, readingToRadians(mils, 'mil', 1));
      const shortcut = sizeMm / mils;
      expect(shortcut).toBeGreaterThan(exact);
      expect((shortcut - exact) / exact).toBeLessThan(tolerance);
      // x²/12 is only the leading term, so it is checked as a proportion rather than to an absolute figure.
      expect((shortcut - exact) / exact / ((mils * MIL_RADIANS) ** 2 / 12)).toBeCloseTo(1, 2);
    }
    const at10 = calculateReticleRanging(input({ apparent: { value: 10, unit: 'mil' } }))!;
    expect((1000 / 10 - at10.distanceMeters) / at10.distanceMeters).toBeLessThan(1e-5);
    expect(at10.sensitivity.worstShare!).toBeGreaterThan(0.01);
  });
  it('spans the optical axis rather than sitting to one side of it', () => {
    // A target twice as tall as it is far away spans a right angle: each half of it is 45 degrees.
    const square = calculateReticleRanging(
      input({ solveFor: 'apparent', targetSize: { value: 2, unit: 'm' }, distance: { value: 1, unit: 'm' } }),
    )!;
    expect(square.angleRadians).toBeCloseTo(Math.PI / 2, 12);
    expect(distanceForAngle(2000, Math.PI / 2)).toBeCloseTo(1, 12);
    // Sixty degrees across the reticle: half of it is thirty, so the target is 2·tan(30°) times the distance.
    const sixty = Math.PI / 3;
    expect(sizeForAngle(sixty, 1)).toBeCloseTo(2000 * Math.tan(Math.PI / 6), 9);
    expect(sizeForAngle(sixty, 1)).toBeCloseTo(1154.7005, 3);
    expect(angleForSize(sizeForAngle(sixty, 1), 1)).toBeCloseTo(sixty, 12);
    // The one-sided relation the sight adjustment tool uses puts the same angle half again as wide, which is
    // why ranging cannot borrow it: 1 m × tan(60°) against 2 m × tan(30°).
    expect(angularSizeMm(sixty, 1)).toBeCloseTo(1732.0508, 3);
  });
});

describe('the three directions', () => {
  it('solves for the distance from a size and a reading', () => {
    const result = calculateReticleRanging(input())!;
    expect(result.solveFor).toBe('distance');
    expect(result.distanceMeters).toBeCloseTo(500, 2);
    expect(result.distanceYards).toBeCloseTo(500 / METERS_PER_YARD, 2);
    expect(result.sizeMm).toBe(1000);
    expect(result.readingMil).toBeCloseTo(2, 10);
    // The same angle read as minutes of angle: one mil is 3.4377 MOA.
    expect(result.readingMoa).toBeCloseTo(2 * (MIL_RADIANS / MOA_RADIANS), 6);
    expect(result.scale).toBe(1);
  });
  it('solves for the target size from a distance and a reading', () => {
    const result = calculateReticleRanging(input({ solveFor: 'size' }))!;
    expect(result.distanceMeters).toBe(500);
    expect(fromSizeMm(result.sizeMm, 'cm')).toBeCloseTo(100, 3);
    expect(result.sizeInch).toBeCloseTo(1000 / MM_PER_INCH, 2);
  });
  it('solves for the reading from a distance and a size', () => {
    const result = calculateReticleRanging(input({ solveFor: 'apparent' }))!;
    expect(result.readingMil).toBeCloseTo(2, 5);
    expect(result.distanceMeters).toBe(500);
    expect(result.sizeMm).toBe(1000);
  });
  it('returns the value it started from after a round trip through all three', () => {
    const start = input({ targetSize: { value: 45, unit: 'cm' }, apparent: { value: 1.7, unit: 'moa' } });
    const ranged = calculateReticleRanging(start)!;
    const sized = calculateReticleRanging({
      ...start,
      solveFor: 'size',
      distance: { value: ranged.distanceMeters, unit: 'm' },
    })!;
    expect(fromSizeMm(sized.sizeMm, 'cm')).toBeCloseTo(45, 8);
    const read = calculateReticleRanging({
      ...start,
      solveFor: 'apparent',
      distance: { value: ranged.distanceMeters, unit: 'm' },
      targetSize: { value: fromSizeMm(sized.sizeMm, 'cm'), unit: 'cm' },
    })!;
    expect(read.readingMoa).toBeCloseTo(1.7, 8);
    const backToDistance = calculateReticleRanging({
      ...start,
      apparent: { value: read.readingMoa, unit: 'moa' },
    })!;
    expect(backToDistance.distanceMeters).toBeCloseTo(ranged.distanceMeters, 6);
  });
  it('reads yards and inches as readily as metres and centimetres', () => {
    const result = calculateReticleRanging(
      input({ targetSize: { value: 18, unit: 'inch' }, apparent: { value: 1, unit: 'mil' } }),
    )!;
    expect(result.sizeMm).toBeCloseTo(457.2, 6);
    expect(result.distanceMeters).toBeCloseTo(457.2, 2);
    expect(result.distanceYards).toBeCloseTo(500, 2);
    const inYards = calculateReticleRanging(input({ solveFor: 'size', distance: { value: 500, unit: 'yd' } }))!;
    expect(inYards.distanceMeters).toBeCloseTo(457.2, 10);
  });
});

describe('second focal plane correction', () => {
  it('doubles the angle when the magnification is halved', () => {
    const settings = input({
      apparent: { value: 4, unit: 'mil' },
      focalPlane: 'sfp',
      magnification: { calibration: 10, used: 5 },
    });
    const result = calculateReticleRanging(settings)!;
    expect(result.scale).toBe(2);
    expect(result.readingMil).toBeCloseTo(4, 10);
    expect(result.trueMil).toBeCloseTo(8, 10);
    // A target that reads four graduations at half power really covers eight mil, so it is half as far away.
    expect(result.distanceMeters).toBeCloseTo(125, 2);
    expect(calculateReticleRanging({ ...settings, focalPlane: 'ffp' })!.distanceMeters).toBeCloseTo(250, 2);
  });
  it('leaves the reading alone at the magnification the reticle was calibrated for', () => {
    const corrected = calculateReticleRanging(input({ focalPlane: 'sfp' }))!;
    expect(corrected.scale).toBe(1);
    expect(corrected.trueMil).toBeCloseTo(corrected.readingMil, 10);
    expect(corrected.distanceMeters).toBeCloseTo(calculateReticleRanging(input())!.distanceMeters, 10);
  });
  it('corrects the other two directions the same way', () => {
    const sfp = { focalPlane: 'sfp', magnification: { calibration: 10, used: 5 } } as const;
    // Half power shows half the graduations, so a target read at 500 m has to be twice the size.
    const sized = calculateReticleRanging(input({ solveFor: 'size', ...sfp }))!;
    expect(fromSizeMm(sized.sizeMm, 'cm')).toBeCloseTo(200, 2);
    const read = calculateReticleRanging(input({ solveFor: 'apparent', ...sfp }))!;
    expect(read.readingMil).toBeCloseTo(1, 4);
    expect(read.trueMil).toBeCloseTo(2, 4);
  });
  it('refuses to guess when a magnification is missing', () => {
    for (const used of [0, -5, NaN])
      expect(
        calculateReticleRanging(input({ focalPlane: 'sfp', magnification: { calibration: 10, used } })),
      ).toBeNull();
    expect(
      calculateReticleRanging(input({ focalPlane: 'sfp', magnification: { calibration: NaN, used: 5 } })),
    ).toBeNull();
  });
});

describe('how far a misread moves the estimate', () => {
  it('puts a larger reading nearer and a smaller reading further away', () => {
    const result = calculateReticleRanging(input())!;
    expect(result.sensitivity.step).toBe(READING_STEP);
    expect(result.sensitivity.nearMeters!).toBeCloseTo(476.19, 2);
    expect(result.sensitivity.farMeters!).toBeCloseTo(526.315, 2);
    expect(result.sensitivity.nearMeters!).toBeLessThan(result.distanceMeters);
    expect(result.sensitivity.farMeters!).toBeGreaterThan(result.distanceMeters);
    // The far side always moves further than the near side, so it sets the spread.
    expect(result.sensitivity.worstShare!).toBeCloseTo(2 / 1.9 - 1, 4);
  });
  it('costs more the smaller the reading, which is to say the further the shot', () => {
    const shares = [10, 5, 2, 1].map(
      (value) => calculateReticleRanging(input({ apparent: { value, unit: 'mil' } }))!.sensitivity.worstShare!,
    );
    expect(shares).toEqual([...shares].sort((a, b) => a - b));
    expect(shares[0]).toBeCloseTo(10 / 9.9 - 1, 3);
    expect(shares[3]).toBeCloseTo(1 / 0.9 - 1, 3);
  });
  it('says nothing rather than something wrong when one step less leaves no angle', () => {
    for (const value of [0.1, 0.05]) {
      const result = calculateReticleRanging(input({ apparent: { value, unit: 'mil' } }))!;
      expect(result.sensitivity.farMeters).toBeNull();
      expect(result.sensitivity.worstShare).toBeNull();
      expect(result.sensitivity.nearMeters!).toBeLessThan(result.distanceMeters);
    }
  });
  it('says nothing about the near side either when one step more leaves the workable range', () => {
    // Just inside the limit: the reading itself is usable, but a tenth more is not, and the distance
    // that would come back from it is negative rather than merely large.
    const atLimit = MAX_ANGLE_RADIANS / MIL_RADIANS - READING_STEP / 2;
    const result = calculateReticleRanging(input({ apparent: { value: atLimit, unit: 'mil' } }))!;
    expect(result.distanceMeters).toBeGreaterThan(0);
    expect(result.sensitivity.nearMeters).toBeNull();
    expect(result.sensitivity.farMeters).not.toBeNull();
    expect(result.sensitivity.worstShare).toBeNull();
    expect(distanceForAngle(1000, readingToRadians(atLimit + READING_STEP, 'mil', 1))).toBeLessThan(0);
  });
  it('measures the step in whichever unit the reticle is read in', () => {
    const inMoa = calculateReticleRanging(input({ apparent: { value: 2, unit: 'moa' } }))!;
    // A tenth of a MOA is a much smaller angle than a tenth of a mil, but against a reading of 2 it is the
    // same twentieth of the estimate either way, so the spread has to come out the same.
    expect(inMoa.sensitivity.worstShare!).toBeCloseTo(calculateReticleRanging(input())!.sensitivity.worstShare!, 4);
    // Two MOA is the narrower angle of the two, so the same target read that way sits much further off.
    expect(inMoa.distanceMeters).toBeGreaterThan(calculateReticleRanging(input())!.distanceMeters);
  });
  it('carries an uncertain target size straight into the distance', () => {
    const result = calculateReticleRanging(input())!;
    expect(result.sizeUncertainty.share).toBe(SIZE_UNCERTAINTY_SHARE);
    expect(result.sizeUncertainty.lowMeters).toBeCloseTo(result.distanceMeters * 0.9, 10);
    expect(result.sizeUncertainty.highMeters).toBeCloseTo(result.distanceMeters * 1.1, 10);
    // The proportionality is exact, not an approximation: a tenth larger target ranges a tenth further.
    const larger = calculateReticleRanging(input({ targetSize: { value: 110, unit: 'cm' } }))!;
    expect(larger.distanceMeters).toBeCloseTo(result.sizeUncertainty.highMeters, 8);
  });
});

describe('unusable input', () => {
  it('returns nothing when a value the direction needs is zero, negative or blank', () => {
    for (const value of [0, -100, NaN, Infinity]) {
      expect(calculateReticleRanging(input({ targetSize: { value, unit: 'cm' } }))).toBeNull();
      expect(calculateReticleRanging(input({ apparent: { value, unit: 'mil' } }))).toBeNull();
      expect(calculateReticleRanging(input({ solveFor: 'size', distance: { value, unit: 'm' } }))).toBeNull();
      expect(calculateReticleRanging(input({ solveFor: 'apparent', distance: { value, unit: 'm' } }))).toBeNull();
    }
  });
  it('ignores the field the chosen direction is solving for', () => {
    // The distance is the answer here, so a half-typed distance must not hide the result.
    expect(calculateReticleRanging(input({ distance: { value: NaN, unit: 'm' } }))).not.toBeNull();
    expect(calculateReticleRanging(input({ solveFor: 'size', targetSize: { value: NaN, unit: 'cm' } }))).not.toBeNull();
    expect(
      calculateReticleRanging(input({ solveFor: 'apparent', apparent: { value: 0, unit: 'mil' } })),
    ).not.toBeNull();
  });
  it('stops where half the angle reaches a right angle and the target has no edge left', () => {
    const limitMil = MAX_ANGLE_RADIANS / MIL_RADIANS;
    expect(limitMil).toBeCloseTo(3141.5927, 4);
    expect(calculateReticleRanging(input({ apparent: { value: 3141, unit: 'mil' } }))).not.toBeNull();
    expect(calculateReticleRanging(input({ apparent: { value: 3142, unit: 'mil' } }))).toBeNull();
    expect(calculateReticleRanging(input({ solveFor: 'size', apparent: { value: 4000, unit: 'mil' } }))).toBeNull();
    // An SFP correction can push an ordinary reading past the limit just as well.
    expect(
      calculateReticleRanging(
        input({
          apparent: { value: 1600, unit: 'mil' },
          focalPlane: 'sfp',
          magnification: { calibration: 10, used: 5 },
        }),
      ),
    ).toBeNull();
  });
  it('keeps the answer sane at the extremes it does accept', () => {
    const tiny = calculateReticleRanging(input({ apparent: { value: 0.01, unit: 'mil' } }))!;
    expect(tiny.distanceMeters).toBeCloseTo(100000, 0);
    const huge = calculateReticleRanging(
      input({ targetSize: { value: 0.1, unit: 'cm' }, apparent: { value: 10, unit: 'mil' } }),
    )!;
    expect(huge.distanceMeters).toBeCloseTo(0.1, 4);
    expect(toMeters(huge.distanceYards, 'yd')).toBeCloseTo(huge.distanceMeters, 10);
  });
});
