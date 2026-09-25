import { describe, expect, it } from 'vitest';

import {
  RANGE_SEARCH_POINTS,
  circleHitProbability,
  erf,
  ethicalRange,
  hitProbabilities,
  sigmaFromExtremeSpread,
  type DispersionInput,
} from '@/lib/hit-probability';
import { MOA_RADIANS } from '@/lib/sight-adjustment';
import { sampleTrajectory, type TrajectoryInput } from '@/lib/trajectory';

const trajectory: TrajectoryInput = {
  muzzleSpeed: { value: 800, unit: 'mps' },
  mass: { value: 10.9, unit: 'g' },
  ballisticCoefficient: 0.462,
  dragModel: 'g1',
  sightHeight: { value: 40, unit: 'mm' },
  distanceUnit: 'm',
  zeroDistance: 100,
  step: 100,
  maxRange: 500,
  dropUnit: 'cm',
  vitalRadius: 10,
  wind: { speed: 0, unit: 'mps', preset: '9', customFromDegrees: 270 },
  atmosphere: {
    source: 'station',
    temperature: { value: 15, unit: 'c' },
    pressure: { value: 1013.25, unit: 'hpa' },
    altitude: { value: 0, unit: 'm' },
  },
  humidityPercent: 0,
  inclineDegrees: 0,
  powder: { sensitivity: { value: 0, unit: 'mps-per-c' }, unit: 'c', reference: 15, temperature: 15 },
};

const groupOnly = (moa: number): DispersionInput => ({
  groupSigmaRadians: moa * MOA_RADIANS,
  velocitySd: { value: 0, unit: 'mps' },
  windSd: { value: 0, unit: 'mps' },
  rangeSdMeters: 0,
});

/** A fixed pseudo-random sequence (Park and Miller's minimal standard), so the check is repeatable. */
function lehmer(seed: number) {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
}

describe('the chance of landing in a circle', () => {
  it('computes erf to the published table', () => {
    // Abramowitz and Stegun, Handbook of Mathematical Functions, table 7.1.
    expect(erf(0.5)).toBeCloseTo(0.5204998778, 9);
    expect(erf(1)).toBeCloseTo(0.8427007929, 9);
    expect(erf(2)).toBeCloseTo(0.995322265, 9);
    expect(erf(-1)).toBeCloseTo(-0.8427007929, 9);
  });

  it('gives the Rayleigh closed form for a round spread', () => {
    // P(r) = 1 - exp(-r²/2σ²): 39.35 % inside one σ, 86.47 % inside two (Ballistipedia, Closed Form Precision).
    expect(circleHitProbability(1, 1, 1)).toBeCloseTo(1 - Math.exp(-0.5), 12);
    expect(circleHitProbability(2, 1, 1)).toBeCloseTo(0.8646647168, 9);
    // A hair apart the integral has to agree with the closed form.
    expect(circleHitProbability(1, 1, 1 + 1e-7)).toBeCloseTo(1 - Math.exp(-0.5), 6);
  });

  it('becomes the one-dimensional normal when the spread is a line', () => {
    // 68.27 % of a normal distribution lies within one standard deviation of its mean.
    expect(circleHitProbability(1, 1, 1e-9)).toBeCloseTo(0.6826894921, 6);
    expect(circleHitProbability(1, 0, 1)).toBeCloseTo(0.6826894921, 9);
  });

  it('agrees with a sampled spread when the two directions differ', () => {
    const random = lehmer(12345);
    const normal = () => Math.sqrt(-2 * Math.log(random())) * Math.cos(2 * Math.PI * random());
    let inside = 0;
    const draws = 200000;
    for (let index = 0; index < draws; index += 1) {
      const x = normal() * 1;
      const y = normal() * 2;
      if (x * x + y * y <= 4) inside += 1;
    }
    expect(circleHitProbability(2, 1, 2)).toBeCloseTo(inside / draws, 2);
    // Which axis carries the larger spread makes no difference to a circle.
    expect(circleHitProbability(2, 2, 1)).toBeCloseTo(circleHitProbability(2, 1, 2), 9);
  });

  it('resolves a spread far narrower than the circle on either axis', () => {
    // Nearly a line of shots: only the wide axis matters, P(|Y| ≤ r) = erf(1/√2) less a few 1e-7
    // for the chord shortening over the narrow spread.
    expect(circleHitProbability(1, 0.001, 1)).toBeCloseTo(0.6826894921, 6);
    expect(circleHitProbability(1, 1, 0.001)).toBeCloseTo(0.6826894921, 6);
    // A spread tight both ways leaves essentially nothing outside.
    expect(circleHitProbability(1, 0.01, 0.02)).toBeCloseTo(1, 9);
    expect(circleHitProbability(1, 0.02, 0.01)).toBeCloseTo(1, 9);
  });

  it('agrees with a brute-force integral over a range of shapes', () => {
    // The same probability summed on a grid of 200 000 strips across the whole circle, fine enough
    // to resolve the narrowest spread here, as a reference independent of the method's choices.
    const reference = (radius: number, sigmaX: number, sigmaY: number) => {
      const strips = 200000;
      const width = (2 * radius) / strips;
      let sum = 0;
      for (let index = 0; index < strips; index += 1) {
        const x = -radius + (index + 0.5) * width;
        const chord = Math.sqrt(radius * radius - x * x);
        const density = Math.exp(-(x * x) / (2 * sigmaX * sigmaX)) / (sigmaX * Math.sqrt(2 * Math.PI));
        sum += density * erf(chord / (sigmaY * Math.SQRT2)) * width;
      }
      return sum;
    };
    const shapes: [number, number, number][] = [
      [1, 0.003, 1],
      [1, 1, 0.003],
      [3, 0.05, 2],
      [3, 2, 0.05],
      [1, 0.3, 5],
      [0.5, 0.2, 0.05],
      [2, 1, 3],
    ];
    for (const [radius, sigmaX, sigmaY] of shapes)
      expect(circleHitProbability(radius, sigmaX, sigmaY)).toBeCloseTo(reference(radius, sigmaX, sigmaY), 6);
  });

  it('turns one group into σ with the published mean extreme spread', () => {
    // Ballistipedia's table: five shots average 3.066255 σ.
    expect(sigmaFromExtremeSpread(3.066255, 5)).toBeCloseTo(1, 9);
    expect(sigmaFromExtremeSpread(1, 1)).toBeNull();
    expect(sigmaFromExtremeSpread(1, 31)).toBeNull();
  });
});

describe('hit probability along the trajectory', () => {
  it('reduces to the group alone when every error of the day is zero', () => {
    const [row] = hitProbabilities(trajectory, groupOnly(1), 0.05, [300])!;
    const sigma = 300 * Math.tan(MOA_RADIANS);
    expect(row!.sigmaHorizontalMeters).toBeCloseTo(sigma, 12);
    expect(row!.sigmaVerticalMeters).toBeCloseTo(sigma, 12);
    expect(row!.probability).toBeCloseTo(1 - Math.exp(-(0.05 ** 2) / (2 * sigma ** 2)), 12);
  });

  it('turns a velocity spread into height only, by the slope of the drop', () => {
    const [row] = hitProbabilities(
      trajectory,
      { ...groupOnly(0), velocitySd: { value: 10, unit: 'mps' } },
      0.05,
      [400],
    )!;
    const [faster] = sampleTrajectory(trajectory, [400], { muzzleSpeedMs: 800.5 })!;
    const [slower] = sampleTrajectory(trajectory, [400], { muzzleSpeedMs: 799.5 })!;
    expect(row!.parts.velocity).toBeCloseTo(((slower!.dropMeters - faster!.dropMeters) / 1) * 10, 5);
    expect(row!.sigmaHorizontalMeters).toBe(0);
  });

  it('turns a wind error into width only, and a distance error into height only', () => {
    const [wind] = hitProbabilities(trajectory, { ...groupOnly(0), windSd: { value: 1, unit: 'mps' } }, 0.05, [300])!;
    expect(wind!.sigmaVerticalMeters).toBe(0);
    expect(wind!.sigmaHorizontalMeters).toBeGreaterThan(0.01);
    const [range] = hitProbabilities(trajectory, { ...groupOnly(0), rangeSdMeters: 10 }, 0.05, [300])!;
    expect(range!.sigmaHorizontalMeters).toBe(0);
    expect(range!.sigmaVerticalMeters).toBeGreaterThan(0.005);
  });

  it('finds the furthest distance at which the chance holds', () => {
    // Group only: P ≥ T while R·tan σ ≤ r / √(-2 ln(1 - T)).
    const radius = 0.1;
    const threshold = 0.9;
    const expected = radius / (Math.tan(MOA_RADIANS) * Math.sqrt(-2 * Math.log(1 - threshold)));
    const found = ethicalRange(trajectory, groupOnly(1), radius, threshold, 400);
    expect(found?.kind).toBe('within');
    // The search is a straight line between points (400 - 2) / (RANGE_SEARCH_POINTS - 1) apart.
    expect(Math.abs((found as { rangeMeters: number }).rangeMeters - expected)).toBeLessThan(400 / RANGE_SEARCH_POINTS);
    expect(ethicalRange(trajectory, groupOnly(1), radius, threshold, 100)?.kind).toBe('beyond');
    expect(ethicalRange(trajectory, groupOnly(1000), radius, threshold, 400)?.kind).toBe('none');
  });

  it('refuses inputs that describe no spread or no circle', () => {
    expect(hitProbabilities(trajectory, groupOnly(1), 0, [100])).toBeNull();
    expect(hitProbabilities(trajectory, { ...groupOnly(1), rangeSdMeters: -1 }, 0.05, [100])).toBeNull();
    expect(ethicalRange(trajectory, groupOnly(1), 0.05, 1, 400)).toBeNull();
  });
});
