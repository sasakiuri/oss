import { describe, expect, it } from 'vitest';

import { MOA_RADIANS } from '@/lib/sight-adjustment';
import { dropsFromZero, fromMetersToDropUnit, type ShotDescription } from '@/lib/trajectory';
import {
  BALLISTIC_COEFFICIENT_RANGE,
  MUZZLE_SPEED_SEARCH_FRACTION,
  readingToMeters,
  solveTruing,
  type TruingInput,
} from '@/lib/trajectory-truing';

const standardAir = {
  source: 'station',
  temperature: { value: 15, unit: 'c' },
  pressure: { value: 1013.25, unit: 'hpa' },
  altitude: { value: 0, unit: 'm' },
} satisfies ShotDescription['atmosphere'];

const shot = (overrides: Partial<ShotDescription> = {}): ShotDescription => ({
  muzzleSpeed: { value: 800, unit: 'mps' },
  ballisticCoefficient: 0.45,
  dragModel: 'g1',
  sightHeight: { value: 45, unit: 'mm' },
  atmosphere: standardAir,
  ...overrides,
});

const ZERO_METERS = 100;
const DISTANCES = [200, 300, 400];

/** What a rifle carrying this load really puts on the target, to be solved back for. */
function measuredFrom(truth: ShotDescription, distances = DISTANCES) {
  const samples = dropsFromZero(truth, ZERO_METERS, distances);
  if (samples === null) throw new Error('the truth has to be a load that can be fired');
  return distances.map((distance, index) => {
    const sample = samples[index];
    if (sample === null || sample === undefined) throw new Error('the truth has to reach every distance');
    return { distance, drop: fromMetersToDropUnit(sample.dropMeters, 'cm') };
  });
}

const input = (overrides: Partial<TruingInput> = {}): TruingInput => ({
  shot: shot(),
  zeroDistance: ZERO_METERS,
  distanceUnit: 'm',
  dropUnit: 'cm',
  reading: 'offset',
  measurements: measuredFrom(shot({ ballisticCoefficient: 0.3 })),
  tolerance: 1,
  target: 'ballistic-coefficient',
  ...overrides,
});

describe('reading a drop off the target', () => {
  it('takes a length in the unit it was measured in', () => {
    expect(readingToMeters(25, 'offset', 'cm', 300)).toBeCloseTo(0.25, 12);
    expect(readingToMeters(10, 'offset', 'inch', 300)).toBeCloseTo(0.254, 12);
  });

  it('turns an angle into the length it subtends at that distance', () => {
    // A mil is a milliradian, so at 100 m it is 10 cm, and the tangent barely moves it.
    expect(readingToMeters(1, 'mil', 'cm', 100)).toBeCloseTo(0.1, 6);
    expect(readingToMeters(1, 'moa', 'cm', 100)).toBeCloseTo(Math.tan(MOA_RADIANS) * 100, 12);
    // The true angle, not the "one MOA is one inch at a hundred yards" shortcut.
    expect(readingToMeters(1, 'moa', 'cm', 91.44)).toBeGreaterThan(0.0254);
  });

  it('carries the sign, so a group above the point of aim is a negative drop', () => {
    expect(readingToMeters(-5, 'offset', 'cm', 200)).toBeCloseTo(-0.05, 12);
    expect(readingToMeters(-1, 'mil', 'cm', 100)).toBeCloseTo(-0.1, 6);
  });
});

describe('solving for the parameter that was asked for', () => {
  it('recovers a ballistic coefficient the shots were generated from', () => {
    const result = solveTruing(input());
    expect(result).not.toBeNull();
    expect(result?.fittedValue).toBeCloseTo(0.3, 2);
    expect(result?.startingValue).toBe(0.45);
  });

  it('recovers a muzzle velocity the shots were generated from', () => {
    const result = solveTruing(
      input({
        measurements: measuredFrom(shot({ muzzleSpeed: { value: 730, unit: 'mps' } })),
        target: 'muzzle-speed',
      }),
    );
    expect(result?.fittedValue).toBeCloseTo(730, 0);
  });

  it('reads a velocity entered in feet per second back in metres per second', () => {
    const result = solveTruing(
      input({
        shot: shot({ muzzleSpeed: { value: 2625, unit: 'fps' } }),
        measurements: measuredFrom(shot({ muzzleSpeed: { value: 2625, unit: 'fps' } })),
        target: 'muzzle-speed',
      }),
    );
    expect(result?.startingValue).toBeCloseTo(800.1, 1);
    expect(result?.fittedValue).toBeCloseTo(800.1, 0);
  });

  it('leaves a load that already fits where it is', () => {
    const result = solveTruing(input({ measurements: measuredFrom(shot()) }));
    expect(result?.fittedValue).toBeCloseTo(0.45, 2);
    expect(result?.fittedRmsMeters).toBeLessThan(0.001);
  });

  it('fits the shots better than the load it started from', () => {
    const result = solveTruing(input());
    expect(result).not.toBeNull();
    expect(result?.fittedRmsMeters ?? 1).toBeLessThan(result?.startingRmsMeters ?? 0);
    expect(result?.startingRmsMeters ?? 0).toBeGreaterThan(0.05);
  });

  it('reads the same shots whether they were written as lengths or as angles', () => {
    const lengths = measuredFrom(shot({ ballisticCoefficient: 0.3 }));
    const angles = lengths.map(({ distance, drop }) => ({
      distance,
      drop: Math.atan(drop / 100 / distance) / MOA_RADIANS,
    }));
    const fromLengths = solveTruing(input({ measurements: lengths }));
    const fromAngles = solveTruing(input({ measurements: angles, reading: 'moa' }));
    expect(fromAngles?.fittedValue ?? 0).toBeCloseTo(fromLengths?.fittedValue ?? 1, 3);
  });

  it('works from a single shot taken where the drop says something', () => {
    // One group beyond the zero does fix one parameter. One group at the zero does not, and one
    // beyond what the band can produce does not either; both are covered further down.
    const result = solveTruing(input({ measurements: measuredFrom(shot({ ballisticCoefficient: 0.32 }), [300]) }));
    expect(result?.fittedValue).toBeCloseTo(0.32, 2);
    expect(result?.fittedRmsMeters ?? 1).toBeLessThan(0.002);
  });
});

describe('the residuals it reports', () => {
  it('names the miss as calculated minus measured, at every distance', () => {
    const result = solveTruing(input());
    expect(result).not.toBeNull();
    expect(result?.rows).toHaveLength(3);
    for (const row of result?.rows ?? []) {
      expect(row.startingResidualMeters).toBeCloseTo((row.startingDropMeters ?? 0) - row.measuredDropMeters, 12);
      expect(row.fittedResidualMeters).toBeCloseTo((row.fittedDropMeters ?? 0) - row.measuredDropMeters, 12);
    }
  });

  it('has the starting load shooting flatter than the shots it is put against', () => {
    // The starting coefficient is the higher one, so it drops less: the residuals are negative.
    const result = solveTruing(input());
    expect(result?.rows).toHaveLength(3);
    for (const row of result?.rows ?? []) expect(row.startingResidualMeters ?? 0).toBeLessThan(0);
  });

  it('leaves every fitted residual inside the tolerance once the fit is inside it', () => {
    const result = solveTruing(input());
    if (result === null) throw new Error('these shots have a fit');
    expect(result.interval).not.toBeNull();
    expect(result.rows).toHaveLength(3);
    for (const row of result.rows)
      expect(Math.abs(row.fittedResidualMeters ?? 1)).toBeLessThanOrEqual(result.toleranceMeters);
  });
});

describe('how far the answer can move and still fit', () => {
  it('brackets the fitted value', () => {
    const result = solveTruing(input());
    expect(result?.interval?.low ?? 1).toBeLessThanOrEqual(result?.fittedValue ?? 0);
    expect(result?.interval?.high ?? 0).toBeGreaterThanOrEqual(result?.fittedValue ?? 1);
  });

  it('widens as the shooter admits to knowing the group less well', () => {
    const tight = solveTruing(input({ tolerance: 0.5 }));
    const loose = solveTruing(input({ tolerance: 3 }));
    const width = (result: ReturnType<typeof solveTruing>) =>
      (result?.interval?.high ?? 0) - (result?.interval?.low ?? 0);
    expect(width(loose)).toBeGreaterThan(width(tight));
  });

  it('is narrower for shots taken further out, where the same coefficient shows more', () => {
    const near = solveTruing(input({ measurements: measuredFrom(shot({ ballisticCoefficient: 0.3 }), [150, 200]) }));
    const far = solveTruing(input({ measurements: measuredFrom(shot({ ballisticCoefficient: 0.3 }), [400, 500]) }));
    const width = (result: ReturnType<typeof solveTruing>) =>
      (result?.interval?.high ?? 0) - (result?.interval?.low ?? 0);
    expect(width(far)).toBeLessThan(width(near));
  });

  it('is judged on the worst group, not on the average of them', () => {
    // A load that lands on two groups and misses the third. The fit is the same whatever the
    // tolerance, so the tolerance can be set between the average miss and the worst one: the
    // screen claims every group is explained to that precision, so the worst is what decides.
    const truth = measuredFrom(shot({ ballisticCoefficient: 0.3 }), [200, 300, 400]);
    const withOutlier = truth.map((row, index) => (index === 2 ? { ...row, drop: row.drop + 1.5 } : row));
    const read = solveTruing(input({ measurements: withOutlier }));
    const rms = fromMetersToDropUnit(read?.fittedRmsMeters ?? 0, 'cm');
    const worstMiss = fromMetersToDropUnit(read?.fittedWorstMeters ?? 0, 'cm');
    expect(rms).toBeLessThan(worstMiss);
    const result = solveTruing(input({ measurements: withOutlier, tolerance: (rms + worstMiss) / 2 }));
    expect(result?.fittedRmsMeters ?? 1).toBeLessThan(result?.toleranceMeters ?? 0);
    expect(result?.fittedWorstMeters ?? 0).toBeGreaterThan(result?.toleranceMeters ?? 1);
    // An average taken over the groups would have called this a fit. The worst group does not.
    expect(result?.interval).toBeNull();
  });

  it('says so when no value in the band brings the shots inside the tolerance', () => {
    // Two groups at the same distance that disagree by more than the tolerance: no load fits both.
    const result = solveTruing({
      ...input(),
      measurements: [
        { distance: 300, drop: 40 },
        { distance: 300, drop: 80 },
      ],
      tolerance: 1,
    });
    expect(result?.interval).toBeNull();
    expect(result?.fittedWorstMeters ?? 0).toBeGreaterThan(result?.toleranceMeters ?? 1);
  });

  it('reports an open end when the fit is still good at the edge of the band', () => {
    // A single shot at the zero distance says nothing about the coefficient, so every value fits.
    const result = solveTruing(input({ measurements: [{ distance: ZERO_METERS, drop: 0 }] }));
    expect(result?.interval?.openLow).toBe(true);
    expect(result?.interval?.openHigh).toBe(true);
    expect(result?.interval?.low).toBeCloseTo(BALLISTIC_COEFFICIENT_RANGE.low, 12);
    expect(result?.interval?.high).toBeCloseTo(BALLISTIC_COEFFICIENT_RANGE.high, 12);
  });

  it('leaves the value where it was when the shots do not ask for it to move', () => {
    // The same shot at the zero distance. Every coefficient fits it, so a search left to itself
    // would answer with whichever end of the band it happened to walk from, and the screen would
    // report a move from 0.450 to 0.010 as though the shot had said so.
    const result = solveTruing(input({ measurements: [{ distance: ZERO_METERS, drop: 0 }] }));
    expect(result?.fittedValue).toBe(0.45);
    expect(result?.atBound).toBeNull();
  });

  it('finds a fit the least squares value misses, because the two answer to different things', () => {
    // Nine groups a centimetre one way and one group a centimetre the other. Least squares is
    // pulled towards the nine and leaves the one nearly two centimetres out; the coefficient the
    // shots were made with holds every one of them to the centimetre. A tolerance between the two
    // has to find that coefficient rather than report that nothing fits.
    const [middle] = measuredFrom(shot({ ballisticCoefficient: 0.3 }), [300]);
    if (middle === undefined) throw new Error('the truth has to reach 300 m');
    const measurements = [
      { distance: 300, drop: middle.drop - 1 },
      ...Array.from({ length: 9 }, () => ({ distance: 300, drop: middle.drop + 1 })),
    ];
    const result = solveTruing(input({ measurements, tolerance: 1.01 }));
    if (result === null) throw new Error('these shots have a fit');
    expect(fromMetersToDropUnit(result.fittedWorstMeters, 'cm')).toBeGreaterThan(1.01);
    expect(result.closestValue).toBeCloseTo(0.3, 4);
    expect(fromMetersToDropUnit(result.closestWorstMeters, 'cm')).toBeCloseTo(1, 3);
    expect(result.interval).not.toBeNull();
    expect(result.interval?.low ?? 0).toBeLessThan(0.3);
    expect(result.interval?.high ?? 0).toBeGreaterThan(0.3);
  });
});

describe('when the shots cannot be explained by this parameter alone', () => {
  it('comes to rest against the edge of the band and says which edge', () => {
    // Flatter at 400 m than even the highest coefficient in the band can shoot.
    const result = solveTruing(input({ measurements: [{ distance: 400, drop: 5 }], tolerance: 1 }));
    expect(result?.atBound).toBe('high');
    expect(result?.fittedValue).toBeCloseTo(BALLISTIC_COEFFICIENT_RANGE.high, 6);
    expect(result?.interval).toBeNull();
  });

  it('answers a very large drop with a very draggy bullet rather than with a bound', () => {
    // Four metres at 300 m is inside the band: it is what a coefficient near 0.044 does.
    const result = solveTruing(input({ measurements: [{ distance: 300, drop: 400 }] }));
    expect(result?.atBound).toBeNull();
    expect(result?.fittedValue ?? 0).toBeLessThan(0.1);
    expect(result?.fittedRmsMeters ?? 1).toBeLessThan(0.001);
  });

  it('keeps a velocity solve inside the band it is allowed to search', () => {
    const result = solveTruing(input({ measurements: [{ distance: 300, drop: 400 }], target: 'muzzle-speed' }));
    expect(result?.atBound).toBe('low');
    expect(result?.fittedValue).toBeCloseTo(800 * (1 - MUZZLE_SPEED_SEARCH_FRACTION), 3);
  });

  it("very nearly explains a coefficient with a velocity, which is why the choice is the shooter's", () => {
    const measurements = measuredFrom(shot({ ballisticCoefficient: 0.3 }));
    const byCoefficient = solveTruing(input({ measurements }));
    const bySpeed = solveTruing(input({ measurements, target: 'muzzle-speed' }));
    // The coefficient solve is the one these shots were made with, so it lands on them exactly.
    expect(byCoefficient?.fittedRmsMeters ?? 1).toBeLessThan(0.001);
    // Taking a slower bullet instead accounts for almost all of the same drop: a long way from
    // the velocity that was entered, and most of the error gone.
    expect(bySpeed?.atBound).toBeNull();
    expect(Math.abs((bySpeed?.fittedValue ?? 0) - 800)).toBeGreaterThan(20);
    expect(bySpeed?.fittedRmsMeters ?? 1).toBeLessThan((bySpeed?.startingRmsMeters ?? 0) / 5);
    // Almost all, not all. The two are not the same curve, and what is left over is the part a
    // shooter cannot read off one afternoon's groups: a couple of centimetres across 200 m.
    expect(bySpeed?.fittedRmsMeters ?? 0).toBeGreaterThan(byCoefficient?.fittedRmsMeters ?? 1);
    expect(bySpeed?.fittedRmsMeters ?? 1).toBeLessThan(0.03);
  });
});

describe('inputs it refuses', () => {
  it('needs at least one shot to fit', () => {
    expect(solveTruing(input({ measurements: [] }))).toBeNull();
  });

  it('needs a zero distance and a tolerance', () => {
    expect(solveTruing(input({ zeroDistance: 0 }))).toBeNull();
    expect(solveTruing(input({ tolerance: 0 }))).toBeNull();
  });

  it('refuses a distance that is not a distance', () => {
    expect(solveTruing(input({ measurements: [{ distance: 0, drop: 10 }] }))).toBeNull();
    expect(solveTruing(input({ measurements: [{ distance: NaN, drop: 10 }] }))).toBeNull();
  });

  it('refuses a reading that is not a number', () => {
    expect(solveTruing(input({ measurements: [{ distance: 300, drop: NaN }] }))).toBeNull();
  });

  it('refuses an angle too steep to be a drop read off a reticle', () => {
    // Half a right angle below the point of aim is a typing slip, and the tangent of it is not a
    // measurement of anything.
    expect(solveTruing(input({ measurements: [{ distance: 300, drop: 900 }], reading: 'mil' }))).toBeNull();
    expect(solveTruing(input({ measurements: [{ distance: 300, drop: 3000 }], reading: 'moa' }))).toBeNull();
    expect(readingToMeters(900, 'mil', 'cm', 300)).toBeNaN();
    // A steep but readable angle is still read.
    expect(readingToMeters(100, 'mil', 'cm', 300)).toBeCloseTo(Math.tan(0.1) * 300, 9);
  });

  it('refuses a load that cannot be fired', () => {
    expect(solveTruing(input({ shot: shot({ ballisticCoefficient: 0 }) }))).toBeNull();
    expect(solveTruing(input({ shot: shot({ muzzleSpeed: { value: 0, unit: 'mps' } }) }))).toBeNull();
  });
});
