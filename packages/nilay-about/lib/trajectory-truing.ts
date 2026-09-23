import { MIL_RADIANS, MOA_RADIANS, toMeters } from './sight-adjustment';
import {
  dropUnitToMeters,
  dropsFromZero,
  toMetersPerSecond,
  type DistanceUnit,
  type DropUnit,
  type ShotDescription,
} from './trajectory';

/**
 * Bringing a calculated trajectory onto the holes a rifle actually makes.
 *
 * A trajectory is calculated from a muzzle velocity and a ballistic coefficient, and neither
 * is known as well as it is written down: the coefficient is a figure for one bullet measured
 * by its maker, and the velocity is whatever the barrel in hand gives, which is not the one on
 * the box. Firing at a distance and measuring where the group landed says what the pair of them
 * together has to produce, and this solves back for one of them.
 *
 * Only one of them, and by the shooter's choice: drop at a distance can be explained by a slower
 * bullet or by a draggier one, and the two bend the curve differently by far less than a group
 * fired in an afternoon can measure. They are separable in principle and not in practice, which
 * comes to the same thing here. Whichever is left fixed is carrying the error of both, which is
 * why the result is a number that reproduces these shots rather than a measurement of the bullet.
 */

export const TRUING_TARGETS = ['ballistic-coefficient', 'muzzle-speed'] as const;
export type TruingTarget = (typeof TRUING_TARGETS)[number];

/** How a drop was read off the target: as a length, or as the angle a sight is marked in. */
export const DROP_READINGS = ['offset', 'moa', 'mil'] as const;
export type DropReading = (typeof DROP_READINGS)[number];

/**
 * The band each parameter is searched over.
 *
 * The coefficients are the band the trajectory tool accepts, which runs from a round ball to
 * the longest match bullet. The velocity is a fraction either side of the one entered: a barrel
 * and a chronograph disagree by a few per cent, so a solve that wandered forty per cent away
 * would be explaining a mistyped distance or a misread group rather than a load.
 */
export const BALLISTIC_COEFFICIENT_RANGE = { low: 0.01, high: 2 } as const;
export const MUZZLE_SPEED_SEARCH_FRACTION = 0.4;

/**
 * Differences in miss smaller than this are below what the model itself resolves.
 *
 * The departure angle is solved until the path is within a tenth of a millimetre of the line of
 * sight at the zero, so two candidates whose misses differ by less than that differ by the solve
 * rather than by the shot. Nothing is decided on a difference this small: where the data does not
 * ask for the value to move, it stays where the shooter put it.
 */
export const RESOLUTION_METERS = 0.0001;

/**
 * The steepest reading that is still a reading.
 *
 * A drop is read as an angle off a reticle, and past a few degrees the tangent runs away with it;
 * a group half a right angle below the point of aim is a typing slip, not a measurement.
 */
const MAX_READING_RADIANS = Math.PI / 4;

export interface TruingMeasurement {
  /** In the input's distance unit, as the shooter wrote it on the target. */
  distance: number;
  /** Below the point of aim is positive, the way every drop chart is read. */
  drop: number;
}

export interface TruingInput {
  /** The load as it is believed to be: the starting point of the solve. */
  shot: ShotDescription;
  zeroDistance: number;
  distanceUnit: DistanceUnit;
  /** The unit a length reading is in, and the unit the tolerance is in. */
  dropUnit: DropUnit;
  reading: DropReading;
  measurements: readonly TruingMeasurement[];
  /** How closely the shooter knows each reading, in `dropUnit`. */
  tolerance: number;
  target: TruingTarget;
}

export interface TruingRow {
  distanceMeters: number;
  measuredDropMeters: number;
  /** Null where the bullet never reached that distance. */
  startingDropMeters: number | null;
  fittedDropMeters: number | null;
  /** Calculated minus measured: positive means the calculation drops more than the rifle did. */
  startingResidualMeters: number | null;
  fittedResidualMeters: number | null;
}

/**
 * The values that fit every group to within the tolerance that was stated.
 *
 * It is found by walking outwards from the value that comes closest to satisfying all of them,
 * and it is reported as one band: a set that fell into separate pieces would be shown as the
 * whole span between them. Ordinary drops taken beyond the zero do not do that.
 */
export interface TruingInterval {
  low: number;
  high: number;
  /** True when the fit was still inside the tolerance at the edge of the search band. */
  openLow: boolean;
  openHigh: boolean;
}

export interface TruingResult {
  target: TruingTarget;
  /**
   * The value that comes closest to satisfying every group at once.
   *
   * It is not the fitted value: least squares uses every group and this one answers only to the
   * worst of them. It is what decides whether any value meets the stated precision, because the
   * least squares value can leave one group outside it while another value would not.
   */
  closestValue: number;
  closestWorstMeters: number;
  /** Ballistic coefficient, or muzzle velocity in metres per second. */
  startingValue: number;
  fittedValue: number;
  /** Set when the solve came to rest against the edge of the band rather than inside it. */
  atBound: 'low' | 'high' | null;
  startingRmsMeters: number;
  fittedRmsMeters: number;
  /** The largest miss left at any one distance, the figure the tolerance is judged against. */
  startingWorstMeters: number;
  fittedWorstMeters: number;
  toleranceMeters: number;
  rows: TruingRow[];
  /** Null when no value in the band brings every shot inside the tolerance. */
  interval: TruingInterval | null;
}

/** A reading turned into a length on the target at that distance. */
export function readingToMeters(
  value: number,
  reading: DropReading,
  dropUnit: DropUnit,
  distanceMeters: number,
): number {
  if (reading === 'offset') return dropUnitToMeters(value, dropUnit);
  // The same convention the trajectory table prints: the true angle, not a small-angle shortcut.
  const radians = value * (reading === 'moa' ? MOA_RADIANS : MIL_RADIANS);
  if (!Number.isFinite(radians) || Math.abs(radians) >= MAX_READING_RADIANS) return NaN;
  return Math.tan(radians) * distanceMeters;
}

/** The load with the parameter under solve replaced by a candidate value. */
function withCandidate(shot: ShotDescription, target: TruingTarget, value: number): ShotDescription {
  return target === 'ballistic-coefficient'
    ? { ...shot, ballisticCoefficient: value }
    : { ...shot, muzzleSpeed: { value, unit: 'mps' } };
}

interface Attempt {
  rmsMeters: number;
  /** The largest miss of any one group, which is what "these shots fit" has to mean. */
  worstMeters: number;
  drops: (number | null)[];
}

/**
 * How badly a candidate misses the shots.
 *
 * The rifle is sighted in again for every candidate, because the shooter sighted in with this
 * load at that distance: the measured drops are distances below the line of sight of a rifle
 * already zeroed, so the calculated ones have to be as well.
 *
 * A candidate that cannot carry to one of the distances misses by an amount with no size, so it
 * is rejected outright rather than scored - otherwise the search would prefer it to a candidate
 * that arrives and is merely wrong.
 */
function attempt(
  input: TruingInput,
  value: number,
  distancesMeters: readonly number[],
  measuredMeters: readonly number[],
): Attempt {
  const shot = withCandidate(input.shot, input.target, value);
  const samples = dropsFromZero(shot, toMeters(input.zeroDistance, input.distanceUnit), distancesMeters);
  const unreachable: Attempt = {
    rmsMeters: Number.POSITIVE_INFINITY,
    worstMeters: Number.POSITIVE_INFINITY,
    drops: distancesMeters.map(() => null),
  };
  if (samples === null) return unreachable;
  let sum = 0;
  let worst = 0;
  const drops: (number | null)[] = [];
  for (const [index, sample] of samples.entries()) {
    const measured = measuredMeters[index];
    if (sample === null || measured === undefined) return unreachable;
    drops.push(sample.dropMeters);
    sum += (sample.dropMeters - measured) ** 2;
    worst = Math.max(worst, Math.abs(sample.dropMeters - measured));
  }
  return { rmsMeters: Math.sqrt(sum / samples.length), worstMeters: worst, drops };
}

/**
 * How finely the band is walked before the search settles into one dip of it.
 *
 * Every step here is a whole trajectory flown and a sight setting solved for, and the screen
 * re-solves as the shooter types, so the counts below are the smallest that still decide the
 * digits. Thirty-two steps put the walk within 0.06 of a coefficient anywhere in the band, which
 * is far finer than the separation between dips that the measurements could produce.
 */
const SCAN_STEPS = 32;
/**
 * Golden section steps over the bracket the walk found.
 *
 * The bracket is two walk steps wide, so the band shrinks by 0.618 per step from about a
 * sixteenth of the band: twenty-four steps leave under a millionth of it, against the three
 * decimals a coefficient is shown to.
 */
const REFINE_STEPS = 24;
/** Halvings used to find each end of the band that still fits, to the same effect. */
const EDGE_STEPS = 24;
const GOLDEN = (Math.sqrt(5) - 1) / 2;

/**
 * The best value in a band, found by walking it before refining.
 *
 * The walk is what makes this safe on a sum of squares that is not guaranteed to have one dip:
 * shots taken inside the zero distance move the opposite way to shots taken beyond it, so a
 * search that only ever stepped downhill could settle in the wrong place. The golden section
 * search then refines the bracket the walk found, which is the part that decides the digits.
 *
 * What the walk cannot see is a dip narrower than its own spacing. That is a limit rather than a
 * guarantee, and the screen says as much rather than promising the global best.
 */
function search(evaluate: (value: number) => number, low: number, high: number, prefer: number): number {
  let bestValue = low;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let index = 0; index <= SCAN_STEPS; index += 1) {
    const value = low + ((high - low) * index) / SCAN_STEPS;
    const score = evaluate(value);
    if (score < bestScore) {
      bestScore = score;
      bestValue = value;
    }
  }
  if (!Number.isFinite(bestScore)) return bestValue;
  const width = (high - low) / SCAN_STEPS;
  let left = Math.max(low, bestValue - width);
  let right = Math.min(high, bestValue + width);
  let innerLeft = right - GOLDEN * (right - left);
  let innerRight = left + GOLDEN * (right - left);
  let leftScore = evaluate(innerLeft);
  let rightScore = evaluate(innerRight);
  for (let step = 0; step < REFINE_STEPS && right - left > 1e-12; step += 1) {
    if (leftScore <= rightScore) {
      right = innerRight;
      innerRight = innerLeft;
      rightScore = leftScore;
      innerLeft = right - GOLDEN * (right - left);
      leftScore = evaluate(innerLeft);
    } else {
      left = innerLeft;
      innerLeft = innerRight;
      leftScore = rightScore;
      innerRight = left + GOLDEN * (right - left);
      rightScore = evaluate(innerRight);
    }
  }
  const refined = (left + right) / 2;
  // Never hand back something worse than the walk already found. Refining a bracket that sits
  // against a band edge can come to rest just inside it, and the edge is the answer there.
  const answer = evaluate(refined) <= bestScore ? refined : bestValue;
  // A flat objective - one group fired at the zero distance, say - is minimised everywhere, and
  // a search left to itself would answer with whichever end of the band it walked from. Where
  // the value already entered does as well as the best found, to within what the model resolves,
  // the data is not asking for it to move and it does not move.
  if (prefer >= low && prefer <= high && evaluate(prefer) <= evaluate(answer) + RESOLUTION_METERS) return prefer;
  return answer;
}

/** How far from the best value the fit stays inside the tolerance, found by halving. */
function edge(
  evaluate: (value: number) => number,
  from: number,
  towards: number,
  toleranceMeters: number,
): { value: number; open: boolean } {
  if (evaluate(towards) <= toleranceMeters) return { value: towards, open: true };
  let inside = from;
  let outside = towards;
  for (let step = 0; step < EDGE_STEPS && Math.abs(outside - inside) > 1e-12; step += 1) {
    const middle = (inside + outside) / 2;
    if (evaluate(middle) <= toleranceMeters) inside = middle;
    else outside = middle;
  }
  return { value: inside, open: false };
}

export function solveTruing(input: TruingInput): TruingResult | null {
  if (input.measurements.length === 0) return null;
  if (!(input.zeroDistance > 0) || !(input.tolerance > 0)) return null;

  const distancesMeters = input.measurements.map((row) => toMeters(row.distance, input.distanceUnit));
  if (!distancesMeters.every((meters) => Number.isFinite(meters) && meters > 0)) return null;
  const measuredMeters = input.measurements.map((row, index) =>
    readingToMeters(row.drop, input.reading, input.dropUnit, distancesMeters[index] ?? NaN),
  );
  if (!measuredMeters.every((meters) => Number.isFinite(meters))) return null;
  const toleranceMeters = dropUnitToMeters(input.tolerance, input.dropUnit);
  if (!(toleranceMeters > 0)) return null;

  const startingValue =
    input.target === 'ballistic-coefficient'
      ? input.shot.ballisticCoefficient
      : toMetersPerSecond(input.shot.muzzleSpeed.value, input.shot.muzzleSpeed.unit);
  if (!Number.isFinite(startingValue) || startingValue <= 0) return null;

  const band =
    input.target === 'ballistic-coefficient'
      ? { low: BALLISTIC_COEFFICIENT_RANGE.low, high: BALLISTIC_COEFFICIENT_RANGE.high }
      : {
          low: startingValue * (1 - MUZZLE_SPEED_SEARCH_FRACTION),
          high: startingValue * (1 + MUZZLE_SPEED_SEARCH_FRACTION),
        };

  const cache = new Map<number, Attempt>();
  const run = (value: number): Attempt => {
    const known = cache.get(value);
    if (known !== undefined) return known;
    const result = attempt(input, value, distancesMeters, measuredMeters);
    cache.set(value, result);
    return result;
  };
  // The fit is the least squares one, which is the estimator that uses every group. Whether a
  // value "fits" is judged on the worst group instead, because that is what the screen claims of
  // it: every one of these groups explained to within the precision the shooter stated.
  const score = (value: number) => run(value).rmsMeters;
  const worst = (value: number) => run(value).worstMeters;

  const starting = run(startingValue);
  const fittedValue = search(score, band.low, band.high, startingValue);
  const fitted = run(fittedValue);
  if (!Number.isFinite(fitted.rmsMeters)) return null;
  // Whether anything fits is a different question from which value fits best, and it has to be
  // asked of the worst group rather than of the average: least squares will trade a small gain
  // across most of the groups for a loss on one, and that one is what the precision is about.
  const closestValue = search(worst, band.low, band.high, startingValue);
  const closest = run(closestValue);

  const rows: TruingRow[] = input.measurements.map((measurement, index) => {
    const distanceMeters = distancesMeters[index] ?? NaN;
    const measuredDropMeters = measuredMeters[index] ?? NaN;
    const startingDropMeters = starting.drops[index] ?? null;
    const fittedDropMeters = fitted.drops[index] ?? null;
    return {
      distanceMeters,
      measuredDropMeters,
      startingDropMeters,
      fittedDropMeters,
      startingResidualMeters: startingDropMeters === null ? null : startingDropMeters - measuredDropMeters,
      fittedResidualMeters: fittedDropMeters === null ? null : fittedDropMeters - measuredDropMeters,
    };
  });

  const interval =
    closest.worstMeters <= toleranceMeters
      ? (() => {
          const low = edge(worst, closestValue, band.low, toleranceMeters);
          const high = edge(worst, closestValue, band.high, toleranceMeters);
          return { low: low.value, high: high.value, openLow: low.open, openHigh: high.open };
        })()
      : null;

  const span = band.high - band.low;
  return {
    target: input.target,
    closestValue,
    closestWorstMeters: closest.worstMeters,
    startingValue,
    fittedValue,
    atBound: fittedValue <= band.low + span * 1e-6 ? 'low' : fittedValue >= band.high - span * 1e-6 ? 'high' : null,
    startingRmsMeters: starting.rmsMeters,
    fittedRmsMeters: fitted.rmsMeters,
    startingWorstMeters: starting.worstMeters,
    fittedWorstMeters: fitted.worstMeters,
    toleranceMeters,
    rows,
    interval,
  };
}
