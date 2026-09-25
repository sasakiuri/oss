/**
 * The chance that a shot lands inside a circle, and how far out that chance holds.
 *
 * The trajectory tool says where the bullet goes. This asks how sure that is. Five things move a
 * shot off the point the shooter meant, and each is entered as one standard deviation:
 *
 *   - the group: the rifle, the load and the shooter together, as an angle;
 *   - the muzzle velocity from shot to shot, which moves the drop and so only the height;
 *   - the error in the crosswind the shooter reads, which moves the drift and so only the side;
 *   - the error in the distance, which is held for the wrong drop and so moves only the height.
 *
 * The four are independent, so their variances add, giving one standard deviation across and one
 * up and down at the target. The shot is taken to be aimed right, holding for the distance and the
 * wind the shooter judged, so the spread is centred on the middle of the circle. Nothing here
 * models a hold that is wrong on average: that is a sight that is off, and it is what the group
 * and sight tools are for.
 *
 * The chance of landing inside a circle centred on a bivariate normal with σx and σy is worked out
 * here rather than drawn by Monte Carlo, so the same input always gives the same figure and the
 * tests can hold it to a closed form. With σx = σy it is the Rayleigh distribution,
 * P = 1 - exp(-r²/2σ²), which Ballistipedia, "Closed Form Precision" (retrieved 2026-09-22), gives
 * for the symmetric model the group tool also uses.
 */

import { expectedExtremeSpread, regularizedLowerGamma } from './group-statistics';
import { MIL_RADIANS, MOA_RADIANS } from './sight-adjustment';
import {
  adjustedMuzzleSpeedMs,
  sampleTrajectoryVariants,
  toMetersPerSecond,
  windToMetersPerSecond,
  type SpeedUnit,
  type TrajectoryInput,
  type TrajectoryRow,
  type WindSpeedUnit,
} from './trajectory';

export type AngleUnit = 'mil' | 'moa';

export function angleToRadians(value: number, unit: AngleUnit): number {
  return value * (unit === 'mil' ? MIL_RADIANS : MOA_RADIANS);
}

/** erf(x), from the regularised incomplete gamma function: erf(x) = P(1/2, x²) for x ≥ 0. */
export function erf(x: number): number {
  if (!Number.isFinite(x)) return x > 0 ? 1 : x < 0 ? -1 : NaN;
  const value = regularizedLowerGamma(0.5, x * x);
  return x < 0 ? -value : value;
}

/** Share of a normal distribution within ±limit of its mean. */
function withinSymmetric(limit: number, sigma: number): number {
  if (sigma === 0) return limit > 0 ? 1 : 0;
  return erf(limit / (sigma * Math.SQRT2));
}

/** Intervals of the Simpson rule across the circle. Even; the integrand is smooth, so this is ample. */
const SIMPSON_INTERVALS = 120;

/**
 * How many standard deviations of the narrower axis the integral spans. Beyond ten the normal
 * density is below 1e-22 of its peak, far under anything the figure is printed to.
 */
const SPAN_SIGMAS = 10;

/**
 * P(x² + y² ≤ r²) for independent normal x and y about the centre, with σx and σy.
 *
 * Equal σ has the closed form. Unequal σ is one integral across the circle: at each point along the
 * narrower axis, its density times the share of the wider axis inside the chord there. A circle is
 * the same seen along either axis, so the two can be swapped freely. Integrating along the narrower
 * one, over no more than ±10 of its σ, keeps its peak resolved however thin it is; the wider axis
 * then only enters through erf, which is smooth. Written with x = r·sin θ the integrand has no
 * square root corner at the edge of the circle, so Simpson's rule converges quickly and evenly.
 */
export function circleHitProbability(radius: number, sigmaX: number, sigmaY: number): number {
  if (![radius, sigmaX, sigmaY].every(Number.isFinite) || radius < 0 || sigmaX < 0 || sigmaY < 0) return NaN;
  if (radius === 0) return 0;
  if (sigmaX === 0 && sigmaY === 0) return 1;
  if (sigmaX === sigmaY) return 1 - Math.exp(-(radius * radius) / (2 * sigmaX * sigmaX));
  const narrow = Math.min(sigmaX, sigmaY);
  const wide = Math.max(sigmaX, sigmaY);
  if (narrow === 0) return withinSymmetric(radius, wide);
  const density = (x: number) => Math.exp(-(x * x) / (2 * narrow * narrow)) / (narrow * Math.sqrt(2 * Math.PI));
  const integrand = (theta: number) => {
    const x = radius * Math.sin(theta);
    const chord = radius * Math.cos(theta);
    return density(x) * withinSymmetric(chord, wide) * chord;
  };
  const high = Math.asin(Math.min(1, (SPAN_SIGMAS * narrow) / radius));
  const width = (2 * high) / SIMPSON_INTERVALS;
  let sum = integrand(-high) + integrand(high);
  for (let index = 1; index < SIMPSON_INTERVALS; index += 1)
    sum += (index % 2 === 0 ? 2 : 4) * integrand(-high + index * width);
  return Math.min(1, Math.max(0, (sum * width) / 3));
}

/**
 * σ of the group from the extreme spread of one group of `shots`.
 *
 * The mean extreme spread of n shots is a fixed multiple of σ (the table lib/group-statistics.ts
 * transcribes from Ballistipedia), so one group divided by that multiple is an unbiased estimate
 * of σ. One group is a poor estimate all the same, which the page says.
 */
export function sigmaFromExtremeSpread(extremeSpread: number, shots: number): number | null {
  const expectation = expectedExtremeSpread(1, shots);
  if (expectation === null || !Number.isFinite(extremeSpread) || extremeSpread < 0) return null;
  return extremeSpread / expectation.meanMm;
}

export interface DispersionInput {
  /** The group as one standard deviation, in radians. */
  groupSigmaRadians: number;
  velocitySd: { value: number; unit: SpeedUnit };
  windSd: { value: number; unit: WindSpeedUnit };
  rangeSdMeters: number;
}

export interface HitRow {
  distanceMeters: number;
  probability: number;
  /** One standard deviation at the target, across and up and down, in metres. */
  sigmaHorizontalMeters: number;
  sigmaVerticalMeters: number;
  /** Each contribution on its own, in metres, so the screen can say which one dominates. */
  parts: { group: number; velocity: number; wind: number; range: number };
}

/** Half the span of the central differences, small enough to stay in the straight part of each curve. */
const VELOCITY_STEP_MS = 1;
const RANGE_STEP_M = 1;

const angle = (row: TrajectoryRow) => Math.atan(row.dropMeters / row.distanceMeters);

/**
 * The chance of a hit on the circle of `radiusMeters` at each distance.
 *
 * Every figure is a derivative of the trajectory the input describes, flown with the rifle's zero
 * held fixed: the drop at one m/s either side of the day's velocity, the drift of a one m/s full
 * value crosswind, and the drop angle a metre either side of the distance. An entry is null where
 * the bullet never got that far, or the distance is too close for the difference either side.
 */
export function hitProbabilities(
  trajectory: TrajectoryInput,
  dispersion: DispersionInput,
  radiusMeters: number,
  distancesMeters: readonly number[],
): (HitRow | null)[] | null {
  const velocitySdMs = toMetersPerSecond(dispersion.velocitySd.value, dispersion.velocitySd.unit);
  const windSdMs = windToMetersPerSecond(dispersion.windSd.value, dispersion.windSd.unit);
  const { groupSigmaRadians, rangeSdMeters } = dispersion;
  if (
    ![velocitySdMs, windSdMs, groupSigmaRadians, rangeSdMeters].every((value) => Number.isFinite(value) && value >= 0)
  )
    return null;
  if (!Number.isFinite(radiusMeters) || radiusMeters <= 0) return null;
  if (!distancesMeters.every((meters) => Number.isFinite(meters) && meters > RANGE_STEP_M)) return null;

  const entered = toMetersPerSecond(trajectory.muzzleSpeed.value, trajectory.muzzleSpeed.unit);
  const speed = trajectory.powder === undefined ? entered : adjustedMuzzleSpeedMs(entered, trajectory.powder);
  const around = distancesMeters.flatMap((meters) => [meters - RANGE_STEP_M, meters + RANGE_STEP_M]);
  const flights = sampleTrajectoryVariants(
    trajectory,
    [...distancesMeters, ...around],
    [{}, { muzzleSpeedMs: speed + VELOCITY_STEP_MS }, { muzzleSpeedMs: speed - VELOCITY_STEP_MS }, { crosswindMs: 1 }],
  );
  if (flights === null) return null;
  const [base, faster, slower, crosswind] = flights;
  if (!base || !faster || !slower || !crosswind) return null;

  const count = distancesMeters.length;
  return distancesMeters.map((distanceMeters, index) => {
    const row = base[index];
    const near = base[count + 2 * index];
    const far = base[count + 2 * index + 1];
    const up = faster[index];
    const down = slower[index];
    const wind = crosswind[index];
    if (!row || !near || !far || !up || !down || !wind) return null;
    const group = distanceMeters * Math.tan(groupSigmaRadians);
    const velocity = (Math.abs(down.dropMeters - up.dropMeters) / (2 * VELOCITY_STEP_MS)) * velocitySdMs;
    const windPart = Math.abs(wind.driftMeters) * windSdMs;
    // Holding for the judged distance when the real one differs: the drop angle moves under the hold.
    const range =
      ((distanceMeters * Math.abs(Math.tan(angle(far)) - Math.tan(angle(near)))) / (2 * RANGE_STEP_M)) * rangeSdMeters;
    const sigmaHorizontalMeters = Math.hypot(group, windPart);
    const sigmaVerticalMeters = Math.hypot(group, velocity, range);
    return {
      distanceMeters,
      probability: circleHitProbability(radiusMeters, sigmaHorizontalMeters, sigmaVerticalMeters),
      sigmaHorizontalMeters,
      sigmaVerticalMeters,
      parts: { group, velocity, wind: windPart, range },
    };
  });
}

/** How finely the furthest distance is looked for, before the crossing is interpolated. */
export const RANGE_SEARCH_POINTS = 200;

export type EthicalRange =
  | { kind: 'within'; rangeMeters: number }
  /** Even the first distance searched falls short of the chance asked for. */
  | { kind: 'none' }
  /** The chance holds all the way to the furthest distance searched. */
  | { kind: 'beyond'; rangeMeters: number }
  /** The bullet stops before the chance falls, which a slow load can do. */
  | { kind: 'unreached'; rangeMeters: number };

/**
 * The furthest distance at which the chance of a hit is still at least `threshold` (0-1).
 *
 * The chance falls as the distance grows, because every part of the spread grows with it, so the
 * answer is the first place it drops below the threshold, read off a straight line between the two
 * searched points either side.
 */
export function ethicalRange(
  trajectory: TrajectoryInput,
  dispersion: DispersionInput,
  radiusMeters: number,
  threshold: number,
  maxMeters: number,
): EthicalRange | null {
  return hitProbabilityReport(trajectory, dispersion, radiusMeters, threshold, [], maxMeters)?.range ?? null;
}

/**
 * The chance at the distances asked for and the furthest distance at the threshold, from one set
 * of flights: the screen wants both, and flying the load twice would double the work per keystroke.
 */
export function hitProbabilityReport(
  trajectory: TrajectoryInput,
  dispersion: DispersionInput,
  radiusMeters: number,
  threshold: number,
  distancesMeters: readonly number[],
  maxMeters: number,
): { rows: (HitRow | null)[]; range: EthicalRange } | null {
  if (!Number.isFinite(threshold) || threshold <= 0 || threshold >= 1) return null;
  if (!Number.isFinite(maxMeters) || maxMeters <= 2 * RANGE_STEP_M) return null;
  const start = 2 * RANGE_STEP_M;
  const step = (maxMeters - start) / (RANGE_SEARCH_POINTS - 1);
  const search = Array.from({ length: RANGE_SEARCH_POINTS }, (_, index) => start + index * step);
  const all = hitProbabilities(trajectory, dispersion, radiusMeters, [...distancesMeters, ...search]);
  if (all === null) return null;
  return {
    rows: all.slice(0, distancesMeters.length),
    range: rangeFromRows(all.slice(distancesMeters.length), threshold, maxMeters),
  };
}

function rangeFromRows(rows: readonly (HitRow | null)[], threshold: number, maxMeters: number): EthicalRange {
  let previous: HitRow | null = null;
  for (const row of rows) {
    if (row === null)
      return previous === null ? { kind: 'none' } : { kind: 'unreached', rangeMeters: previous.distanceMeters };
    if (row.probability < threshold) {
      if (previous === null) return { kind: 'none' };
      const fraction = (previous.probability - threshold) / (previous.probability - row.probability);
      return {
        kind: 'within',
        rangeMeters: previous.distanceMeters + fraction * (row.distanceMeters - previous.distanceMeters),
      };
    }
    previous = row;
  }
  return { kind: 'beyond', rangeMeters: maxMeters };
}
