import { CONFIDENCE_LEVEL, studentTQuantile } from './group-statistics';
import type { ImpactMode, LoadStep } from './schemas/load-development';
import type { ShotImpact } from './schemas/shot-group';
import { parseVelocities } from './velocity-spread';

/**
 * Reading a load development series: one set of rounds per charge (or any other stepped value),
 * and the question of where along the series the velocity, or the centre of the group, moves least.
 *
 * Both the ladder and the group series ask the same thing of adjacent steps - how far apart are
 * they - and both are usually answered from one or three shots a step. That is the whole problem:
 * a difference between two steps is only a difference if it is larger than what the shots within
 * a step already scatter by. Every comparison here therefore carries its 95 % interval, taken from
 * the scatter measured inside the steps, and the verdict on a step pair is one of three:
 *
 *   - small:     the whole interval lies inside the change the shooter called small;
 *   - large:     the whole interval lies outside it;
 *   - undecided: the interval reaches across it, so these shots cannot say which.
 *
 * The threshold is the shooter's own. There is no published figure for how flat a "flat spot"
 * is, and the tool does not invent one.
 *
 * The scatter is pooled over every step with two or more shots (the one-way analysis of variance
 * estimate, with Σ(nᵢ − 1) degrees of freedom). That assumes the scatter does not change much from
 * step to step, and it is what lets a one-shot step be compared at all. The t distribution and its
 * quantiles are the ones in group-statistics, tested there against the NIST/SEMATECH tables.
 */

/** More steps than a ladder or a group series is fired in, and few enough to read on one screen. */
export const LOAD_STEP_LIMIT = 20;

/** The most shots a single step is summarised over. */
export const STEP_SHOT_LIMIT = 30;

export interface ParsedNumbers {
  values: number[];
  invalid: string[];
}

const SEPARATORS = /[\s,、，]+/u;

/** Offsets on the target, which may be either side of the aim point and so may be negative or zero. */
export function parseOffsets(text: string): ParsedNumbers {
  const values: number[] = [];
  const invalid: string[] = [];
  for (const entry of text.split(SEPARATORS)) {
    if (entry === '') continue;
    const value = Number(entry);
    if (Number.isFinite(value)) values.push(value);
    else invalid.push(entry);
  }
  return { values, invalid };
}

export interface ParsedImpacts {
  impacts: ShotImpact[];
  /** Lines that were not a pair of numbers, as written. */
  invalid: string[];
}

/**
 * One impact per line, in millimetres from the aim point as "right up" or "right, up" - the same
 * convention as the shot group tool. Anything else on a line is handed back.
 */
export function parseImpacts(text: string): ParsedImpacts {
  const impacts: ShotImpact[] = [];
  const invalid: string[] = [];
  for (const raw of text.split(/\r?\n/u)) {
    const line = raw.trim();
    if (line === '') continue;
    const parts = line.split(SEPARATORS).filter((part) => part !== '');
    const numbers = parts.map(Number);
    if (numbers.length === 2 && numbers.every((value) => Number.isFinite(value))) {
      impacts.push({ x: numbers[0] ?? NaN, y: numbers[1] ?? NaN });
    } else invalid.push(line);
  }
  return { impacts, invalid };
}

export interface Interval {
  low: number;
  high: number;
}

/**
 * 'no-interval' is a series with no repeated shots at all; 'no-dispersion' is one whose repeated
 * shots all agreed exactly. The second is not a spread known to be zero: rounded readings or
 * coordinates that happen to agree say nothing about the scatter, and an interval of no width would
 * claim the change is known exactly. Both are refused rather than read.
 */
export type PairVerdict = 'small' | 'large' | 'undecided' | 'no-interval' | 'no-dispersion';

/** A one-dimensional difference against the shooter's threshold. Both ends are inclusive of "small". */
export function classifyInterval(interval: Interval | null, threshold: number): PairVerdict {
  if (interval === null) return 'no-interval';
  if (interval.low >= -threshold && interval.high <= threshold) return 'small';
  if (interval.low > threshold || interval.high < -threshold) return 'large';
  return 'undecided';
}

/**
 * A movement of the group centre, known as a rectangle of per-axis intervals, against a circle of
 * the shooter's radius: small when the whole rectangle is inside the circle, large when all of it is
 * outside, undecided otherwise.
 */
export function classifyRectangle(x: Interval | null, y: Interval | null, radius: number): PairVerdict {
  if (x === null || y === null) return 'no-interval';
  const far = (interval: Interval) => Math.max(Math.abs(interval.low), Math.abs(interval.high));
  const near = (interval: Interval) =>
    interval.low <= 0 && interval.high >= 0 ? 0 : Math.min(Math.abs(interval.low), Math.abs(interval.high));
  if (Math.hypot(far(x), far(y)) <= radius) return 'small';
  if (Math.hypot(near(x), near(y)) > radius) return 'large';
  return 'undecided';
}

export interface Pooled {
  sd: number;
  degreesOfFreedom: number;
}

/** The pooled scatter as something an interval can rest on: absent, or measured at exactly zero, is not. */
const usable = (pooled: Pooled | null): pooled is Pooled => pooled !== null && pooled.sd > 0;

/** The verdict to give when the scatter cannot carry an interval. */
const refusal = (pooled: Pooled | null): PairVerdict => (pooled === null ? 'no-interval' : 'no-dispersion');

/** The within-step scatter pooled over every step with at least two shots, or null when there is none. */
export function pooledDeviation(samples: readonly (readonly number[])[]): Pooled | null {
  let squares = 0;
  let degreesOfFreedom = 0;
  for (const values of samples) {
    if (values.length < 2) continue;
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    squares += values.reduce((sum, value) => sum + (value - mean) ** 2, 0);
    degreesOfFreedom += values.length - 1;
  }
  if (degreesOfFreedom === 0) return null;
  return { sd: Math.sqrt(squares / degreesOfFreedom), degreesOfFreedom };
}

export interface StepSamples {
  /** The stepped value: a charge, a seating depth, whatever the series varies. */
  value: number;
  samples: readonly number[];
}

export interface StepMean {
  value: number;
  count: number;
  mean: number;
  /** Where the step's true mean lies, from the pooled scatter. Null without any repeated shots. */
  interval: Interval | null;
}

export interface AdjacentPair {
  /** Indices into the analysed steps, which are sorted by value. */
  from: number;
  to: number;
  difference: number;
  interval: Interval | null;
  verdict: PairVerdict;
}

/**
 * The longest stretch of adjacent pairs whose measured change is within the threshold.
 *
 * `supported` says whether every pair in it is also small once the noise is counted; a stretch
 * that is flat only on the point estimates is what one to three shots a step usually produce.
 */
export interface FlatRun {
  /** Indices into the analysed steps, first and last step of the run. */
  first: number;
  last: number;
  supported: boolean;
}

export interface SeriesAnalysis {
  steps: StepMean[];
  pooled: Pooled | null;
  pairs: AdjacentPair[];
  flatRun: FlatRun | null;
  level: number;
}

/** The longest run of consecutive pairs passing `within`; the earliest on a tie. */
function longestRun<T>(pairs: readonly T[], within: (pair: T) => boolean): { first: number; last: number } | null {
  let best: { first: number; last: number } | null = null;
  let start = -1;
  for (let index = 0; index <= pairs.length; index += 1) {
    const pair = pairs[index];
    if (pair !== undefined && within(pair)) {
      if (start < 0) start = index;
      continue;
    }
    if (start >= 0) {
      if (best === null || index - start > best.last - best.first) best = { first: start, last: index };
      start = -1;
    }
  }
  return best;
}

const sortedSteps = <T extends { value: number }>(steps: readonly T[]) =>
  [...steps].sort((first, second) => first.value - second.value);

/** True when two steps share a value, which leaves the order of the series undefined. */
export function hasDuplicateValues(values: readonly number[]): boolean {
  return new Set(values).size !== values.length;
}

/**
 * Adjacent steps of a one-dimensional series - velocities, or the vertical centre of the groups -
 * compared against the shooter's threshold. Steps without a shot are left out; the rest are sorted
 * by their value, so "adjacent" means the next value that was actually fired.
 */
export function analyseSeries(
  input: readonly StepSamples[],
  threshold: number,
  level = CONFIDENCE_LEVEL,
): SeriesAnalysis | null {
  if (!Number.isFinite(threshold) || threshold < 0 || !(level > 0 && level < 1)) return null;
  const steps = sortedSteps(input.filter((step) => step.samples.length > 0 && Number.isFinite(step.value)));
  if (steps.length < 2) return null;
  if (!steps.every((step) => step.samples.every((sample) => Number.isFinite(sample)))) return null;

  const pooled = pooledDeviation(steps.map((step) => step.samples));
  const t = usable(pooled) ? studentTQuantile((1 + level) / 2, pooled.degreesOfFreedom) : NaN;

  const means: StepMean[] = steps.map((step) => {
    const mean = step.samples.reduce((sum, value) => sum + value, 0) / step.samples.length;
    const half = usable(pooled) ? (t * pooled.sd) / Math.sqrt(step.samples.length) : NaN;
    return {
      value: step.value,
      count: step.samples.length,
      mean,
      interval: usable(pooled) ? { low: mean - half, high: mean + half } : null,
    };
  });

  const pairs: AdjacentPair[] = [];
  for (let index = 0; index + 1 < means.length; index += 1) {
    const from = means[index];
    const to = means[index + 1];
    if (from === undefined || to === undefined) continue;
    const difference = to.mean - from.mean;
    const interval = usable(pooled)
      ? (() => {
          const half = t * pooled.sd * Math.sqrt(1 / from.count + 1 / to.count);
          return { low: difference - half, high: difference + half };
        })()
      : null;
    pairs.push({
      from: index,
      to: index + 1,
      difference,
      interval,
      verdict: interval === null ? refusal(pooled) : classifyInterval(interval, threshold),
    });
  }

  const run = longestRun(pairs, (pair) => Math.abs(pair.difference) <= threshold);
  const flatRun =
    run === null
      ? null
      : {
          first: run.first,
          last: run.last,
          supported: pairs.slice(run.first, run.last).every((pair) => pair.verdict === 'small'),
        };

  return { steps: means, pooled, pairs, flatRun, level };
}

export interface StepImpacts {
  value: number;
  impacts: readonly ShotImpact[];
}

export interface StepCentre {
  value: number;
  count: number;
  x: number;
  y: number;
}

export interface CentrePair {
  from: number;
  to: number;
  dx: number;
  dy: number;
  /** How far the centre moved, in the plane. */
  distance: number;
  /** Per-axis intervals, each at the Bonferroni level so that the two together hold at `level`. */
  xInterval: Interval | null;
  yInterval: Interval | null;
  verdict: PairVerdict;
}

export interface CentreAnalysis {
  steps: StepCentre[];
  pooledX: Pooled | null;
  pooledY: Pooled | null;
  pairs: CentrePair[];
  flatRun: FlatRun | null;
  level: number;
  /** The level each axis is quoted at so that the rectangle holds at `level`. */
  axisLevel: number;
}

/**
 * Adjacent groups compared by how far their centres moved.
 *
 * The movement is known on each axis to a t interval from the pooled scatter on that axis. The two
 * axes are taken each at 1 − (1 − level)/2 (Bonferroni), so the rectangle they make holds the true
 * movement with at least the stated confidence; it is then set against a circle of the shooter's
 * radius.
 */
export function analyseCentres(
  input: readonly StepImpacts[],
  radius: number,
  level = CONFIDENCE_LEVEL,
): CentreAnalysis | null {
  if (!Number.isFinite(radius) || radius < 0 || !(level > 0 && level < 1)) return null;
  const steps = sortedSteps(input.filter((step) => step.impacts.length > 0 && Number.isFinite(step.value)));
  if (steps.length < 2) return null;
  if (!steps.every((step) => step.impacts.every((impact) => Number.isFinite(impact.x) && Number.isFinite(impact.y))))
    return null;

  const axisLevel = 1 - (1 - level) / 2;
  const pooledX = pooledDeviation(steps.map((step) => step.impacts.map((impact) => impact.x)));
  const pooledY = pooledDeviation(steps.map((step) => step.impacts.map((impact) => impact.y)));
  // Both axes rest on the same shots, so they share the degrees of freedom.
  // An axis on which every repeated shot agreed cannot carry an interval, and a rectangle needs both.
  const bothUsable = usable(pooledX) && usable(pooledY);
  const t = bothUsable && pooledX ? studentTQuantile((1 + axisLevel) / 2, pooledX.degreesOfFreedom) : NaN;

  const centres: StepCentre[] = steps.map((step) => ({
    value: step.value,
    count: step.impacts.length,
    x: step.impacts.reduce((sum, impact) => sum + impact.x, 0) / step.impacts.length,
    y: step.impacts.reduce((sum, impact) => sum + impact.y, 0) / step.impacts.length,
  }));

  const pairs: CentrePair[] = [];
  for (let index = 0; index + 1 < centres.length; index += 1) {
    const from = centres[index];
    const to = centres[index + 1];
    if (from === undefined || to === undefined) continue;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const spread = Math.sqrt(1 / from.count + 1 / to.count);
    const around = (difference: number, pooled: Pooled | null): Interval | null =>
      bothUsable && pooled !== null
        ? { low: difference - t * pooled.sd * spread, high: difference + t * pooled.sd * spread }
        : null;
    const xInterval = around(dx, pooledX);
    const yInterval = around(dy, pooledY);
    pairs.push({
      from: index,
      to: index + 1,
      dx,
      dy,
      distance: Math.hypot(dx, dy),
      xInterval,
      yInterval,
      verdict:
        xInterval === null || yInterval === null
          ? refusal(pooledX === null || pooledY === null ? null : pooledX)
          : classifyRectangle(xInterval, yInterval, radius),
    });
  }

  const run = longestRun(pairs, (pair) => pair.distance <= radius);
  const flatRun =
    run === null
      ? null
      : {
          first: run.first,
          last: run.last,
          supported: pairs.slice(run.first, run.last).every((pair) => pair.verdict === 'small'),
        };

  return { steps: centres, pooledX, pooledY, pairs, flatRun, level, axisLevel };
}

/** The most decimals an endpoint is ever written with. */
const DISPLAY_DIGITS_LIMIT = 6;

const outward = (interval: Interval, digits: number): Interval => {
  const scale = 10 ** digits;
  return { low: Math.floor(interval.low * scale) / scale, high: Math.ceil(interval.high * scale) / scale };
};

/**
 * An interval rounded for the screen without contradicting its verdict.
 *
 * The verdict is taken on the unrounded interval. Rounding each end to the nearest could draw an
 * undecided interval as if it sat inside the threshold (5.042 written as 5.0 against 5). Each end is
 * therefore rounded outward - the written interval always contains the real one - and decimals are
 * added until the written interval reads the same against the threshold as the real one did.
 */
export function displayInterval(
  interval: Interval,
  threshold: number,
  verdict: PairVerdict,
  minDigits = 1,
): Interval & { digits: number } {
  let digits = minDigits;
  let shown = outward(interval, digits);
  while (digits < DISPLAY_DIGITS_LIMIT && classifyInterval(shown, threshold) !== verdict) {
    digits += 1;
    shown = outward(interval, digits);
  }
  return { ...shown, digits };
}

/** The two axes of a centre movement, rounded together so the written rectangle keeps its verdict. */
export function displayRectangle(
  x: Interval,
  y: Interval,
  radius: number,
  verdict: PairVerdict,
  minDigits = 1,
): { x: Interval; y: Interval; digits: number } {
  let digits = minDigits;
  let shownX = outward(x, digits);
  let shownY = outward(y, digits);
  while (digits < DISPLAY_DIGITS_LIMIT && classifyRectangle(shownX, shownY, radius) !== verdict) {
    digits += 1;
    shownX = outward(x, digits);
    shownY = outward(y, digits);
  }
  return { x: shownX, y: shownY, digits };
}

export interface ReadStep {
  value: number;
  /** Velocities in the unit they were typed in, at most STEP_SHOT_LIMIT of them. */
  velocities: number[];
  velocityInvalid: string[];
  /** Heights, when the impacts are recorded as heights alone. */
  heights: number[];
  /** Both coordinates, when they are recorded as pairs. */
  impacts: ShotImpact[];
  impactInvalid: string[];
  /** Set when either list was longer than STEP_SHOT_LIMIT and was cut to it. */
  truncated: boolean;
}

/** One step as typed, read into numbers; what could not be read is handed back to be named. */
export function readStep(step: LoadStep, mode: ImpactMode): ReadStep {
  const velocities = parseVelocities(step.velocities);
  const heights = mode === 'vertical' ? parseOffsets(step.impacts) : { values: [], invalid: [] };
  const pairs = mode === 'both' ? parseImpacts(step.impacts) : { impacts: [], invalid: [] };
  return {
    value: step.value,
    velocities: velocities.values.slice(0, STEP_SHOT_LIMIT),
    velocityInvalid: velocities.invalid,
    heights: heights.values.slice(0, STEP_SHOT_LIMIT),
    impacts: pairs.impacts.slice(0, STEP_SHOT_LIMIT),
    impactInvalid: mode === 'vertical' ? heights.invalid : pairs.invalid,
    truncated:
      velocities.values.length > STEP_SHOT_LIMIT ||
      heights.values.length > STEP_SHOT_LIMIT ||
      pairs.impacts.length > STEP_SHOT_LIMIT,
  };
}

/**
 * The confirmed wording of the provisions the notes quote, as read at e-Gov 法令検索.
 * Kept here so the screen and its tests quote one text.
 */
export const LAW_TEXT_CHECKED_ON = '2026-09-23';
export const EXPLOSIVES_ACT_URL = 'https://laws.e-gov.go.jp/law/325AC0000000149';
export const EXPLOSIVES_REGULATION_URL = 'https://laws.e-gov.go.jp/law/325M50000400088';
