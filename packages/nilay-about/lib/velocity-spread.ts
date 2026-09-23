import {
  CONFIDENCE_LEVEL,
  PUBLISHED_GROUP_SIZE_LIMIT,
  chiSquaredQuantile,
  expectedExtremeSpread,
  gaussianCorrection,
  studentTQuantile,
} from './group-statistics';
import { MIL_RADIANS, MOA_RADIANS } from './sight-adjustment';
import { departureAngle, dropsAtAngle, toMetersPerSecond, type ShotDescription, type SpeedUnit } from './trajectory';

/**
 * What a chronograph's readings say, and what they cost at the far end of the range.
 *
 * A string of velocities is usually read for its extreme spread, which is the one number of the
 * set that gets worse the more shots are fired: it is the distance between the two unluckiest
 * rounds and it has no fixed relationship to the load. The standard deviation is the figure that
 * does describe the load, and on a handful of shots it is itself known only roughly - so it is
 * reported here with the interval it is known to, against the extreme spread a load of that
 * deviation is expected to produce for the number of shots that were actually fired.
 *
 * None of it matters on its own. What a shooter is buying with a tighter string is a smaller
 * vertical spread at distance, and that is the other half of this module: the same rifle, the
 * same sight setting, rounds that leave at different speeds.
 */

export const VELOCITY_SAMPLE_LIMIT = 60;

export interface ParsedVelocities {
  values: number[];
  /** The entries that were not a speed, kept as they were written so they can be named. */
  invalid: string[];
}

/**
 * The readings as they come off a chronograph: typed in, or pasted from whatever the device shows.
 *
 * A string is written down as a column, or a line, or a comma separated row, and asking for one
 * field per shot would make a form of sixty boxes for the strings worth measuring. Anything that
 * is not a speed is handed back rather than dropped, so a stray word is named instead of quietly
 * changing the average.
 */
export function parseVelocities(text: string): ParsedVelocities {
  const values: number[] = [];
  const invalid: string[] = [];
  for (const entry of text.split(/[\s,、，]+/u)) {
    if (entry === '') continue;
    const value = Number(entry);
    if (Number.isFinite(value) && value > 0) values.push(value);
    else invalid.push(entry);
  }
  return { values, invalid };
}

export interface Interval {
  lowMs: number;
  highMs: number;
}

/**
 * The extreme spread many strings of this length produce, for a load of the measured deviation.
 *
 * The published table this comes from is written in multiples of sigma, so it describes a string
 * of velocities as readily as the group on paper it was tabulated for; only the unit changes.
 * The fields are named for what they hold here rather than for the paper it was measured on.
 */
export interface ExpectedSpread {
  count: number;
  meanMs: number;
  medianMs: number;
  /** The middle half of strings falls between these two. */
  p25Ms: number;
  p75Ms: number;
  /** Nineteen strings in twenty fall between these two. */
  p025Ms: number;
  p975Ms: number;
}

export interface VelocitySummary {
  count: number;
  meanMs: number;
  /** The sample standard deviation: the one a chronograph prints. */
  sdMs: number;
  /**
   * The same deviation with the small sample bias taken out.
   *
   * Taking the square root of an unbiased variance gives a deviation that reads low, by about
   * 3 % on five shots and 1 % on ten. It is shown beside the plain one rather than instead of
   * it, because the plain one is what the machine on the bench displayed.
   */
  sdUnbiasedMs: number;
  extremeSpreadMs: number;
  minMs: number;
  maxMs: number;
  /** The deviation as a fraction of the mean, which is how loads of different speeds compare. */
  coefficientOfVariation: number;
  /** Where the true average of the load lies, at the confidence level below. */
  meanInterval: Interval;
  /** Where the true deviation lies. Null on a single shot, which says nothing about spread. */
  sdInterval: Interval | null;
  /** What a load of this deviation does for extreme spread over many strings of this length. */
  expectedSpread: ExpectedSpread | null;
  level: number;
}

/** The published distribution of the extreme spread, read in velocity rather than on paper. */
function expectedSpreadOf(sdMs: number, count: number): ExpectedSpread | null {
  if (count > PUBLISHED_GROUP_SIZE_LIMIT) return null;
  const published = expectedExtremeSpread(sdMs, count);
  if (published === null) return null;
  return {
    count,
    meanMs: published.meanMm,
    medianMs: published.medianMm,
    p25Ms: published.p25Mm,
    p75Ms: published.p75Mm,
    p025Ms: published.p025Mm,
    p975Ms: published.p975Mm,
  };
}

/** The readings, in metres per second, or null when they are not a string of shots. */
export function summariseVelocities(valuesMs: readonly number[], level = CONFIDENCE_LEVEL): VelocitySummary | null {
  const count = valuesMs.length;
  if (count < 2 || count > VELOCITY_SAMPLE_LIMIT) return null;
  if (!valuesMs.every((value) => Number.isFinite(value) && value > 0)) return null;
  if (!(level > 0 && level < 1)) return null;

  const meanMs = valuesMs.reduce((total, value) => total + value, 0) / count;
  const variance = valuesMs.reduce((total, value) => total + (value - meanMs) ** 2, 0) / (count - 1);
  const sdMs = Math.sqrt(variance);
  const minMs = Math.min(...valuesMs);
  const maxMs = Math.max(...valuesMs);

  const tail = (1 - level) / 2;
  const halfWidthMs = (studentTQuantile(1 - tail, count - 1) * sdMs) / Math.sqrt(count);
  // The interval on a deviation is the chi-squared one, and it is not symmetric: a handful of
  // shots can understate the spread far more easily than they can overstate it.
  const upperChi = chiSquaredQuantile(1 - tail, count - 1);
  const lowerChi = chiSquaredQuantile(tail, count - 1);
  const sdInterval =
    Number.isFinite(upperChi) && Number.isFinite(lowerChi) && upperChi > 0 && lowerChi > 0
      ? {
          lowMs: Math.sqrt(((count - 1) * variance) / upperChi),
          highMs: Math.sqrt(((count - 1) * variance) / lowerChi),
        }
      : null;

  return {
    count,
    meanMs,
    sdMs,
    sdUnbiasedMs: sdMs * gaussianCorrection(count),
    extremeSpreadMs: maxMs - minMs,
    minMs,
    maxMs,
    coefficientOfVariation: sdMs / meanMs,
    meanInterval: { lowMs: meanMs - halfWidthMs, highMs: meanMs + halfWidthMs },
    sdInterval,
    expectedSpread: expectedSpreadOf(sdMs, count),
    level,
  };
}

/** Past this the answer is an arithmetic exercise rather than a shooting plan. */
export const SD_PRECISION_SHOT_LIMIT = 200;

/**
 * How many shots it takes to know the standard deviation itself to within a fraction of it.
 *
 * This asks nothing about the load: the width of a chi-squared interval in multiples of the
 * deviation depends only on how many shots were fired. It is the answer to why a five shot
 * string says so little - and to why the strings that get quoted are rarely long enough.
 */
export function shotsForSdPrecision(relativeHalfWidth: number, level = CONFIDENCE_LEVEL): number | null {
  if (!Number.isFinite(relativeHalfWidth) || relativeHalfWidth <= 0) return null;
  if (!(level > 0 && level < 1)) return null;
  const tail = (1 - level) / 2;
  for (let count = 2; count <= SD_PRECISION_SHOT_LIMIT; count += 1) {
    const low = Math.sqrt((count - 1) / chiSquaredQuantile(1 - tail, count - 1));
    const high = Math.sqrt((count - 1) / chiSquaredQuantile(tail, count - 1));
    if (!Number.isFinite(low) || !Number.isFinite(high)) return null;
    if ((high - low) / 2 <= relativeHalfWidth) return count;
  }
  return null;
}

export interface VerticalSpreadRow {
  distanceMeters: number;
  /** Drop at the average velocity, for the sight setting the rifle is zeroed with. */
  dropMeters: number;
  /** How far apart a round one deviation fast and one deviation slow land. */
  spreadMeters: number;
  spreadMoa: number;
  spreadMil: number;
  /** The same for the band that holds nineteen rounds in twenty. */
  spreadWideMeters: number;
}

/** The multiple of the deviation the wide band stands for; the narrow band is one deviation. */
export const SPREAD_WIDE_SIGMAS = 1.959964;

/**
 * What a velocity that changes from shot to shot costs in height at distance.
 *
 * The rifle is sighted in once, at the average velocity, and every round is then fired at that
 * same departure angle. Sighting in again for each velocity would make the rounds agree at the
 * zero distance by construction, which is exactly what a chronograph string is not allowed to
 * do: the rifle does not know how fast the next round will leave.
 */
export function verticalSpread(
  shot: ShotDescription,
  zeroDistanceMeters: number,
  distancesMeters: readonly number[],
  sdMs: number,
): VerticalSpreadRow[] | null {
  if (!Number.isFinite(sdMs) || sdMs < 0) return null;
  const angleRadians = departureAngle(shot, zeroDistanceMeters);
  if (angleRadians === null) return null;

  const meanMs = toMetersPerSecond(shot.muzzleSpeed.value, shot.muzzleSpeed.unit);
  const at = (offsetMs: number) => {
    const speed = meanMs + offsetMs;
    if (!(speed > 0)) return null;
    return dropsAtAngle(
      { ...shot, muzzleSpeed: { value: speed, unit: 'mps' as SpeedUnit } },
      angleRadians,
      distancesMeters,
    );
  };
  const middle = at(0);
  const slow = at(-sdMs);
  const fast = at(sdMs);
  const slowWide = at(-SPREAD_WIDE_SIGMAS * sdMs);
  const fastWide = at(SPREAD_WIDE_SIGMAS * sdMs);
  if (middle === null || slow === null || fast === null || slowWide === null || fastWide === null) return null;

  const rows: VerticalSpreadRow[] = [];
  for (const [index, distanceMeters] of distancesMeters.entries()) {
    const centre = middle[index];
    const low = slow[index];
    const high = fast[index];
    const lowWide = slowWide[index];
    const highWide = fastWide[index];
    if (!centre || !low || !high || !lowWide || !highWide) continue;
    const spreadMeters = Math.abs(low.dropMeters - high.dropMeters);
    rows.push({
      distanceMeters,
      dropMeters: centre.dropMeters,
      spreadMeters,
      spreadMoa: Math.atan(spreadMeters / distanceMeters) / MOA_RADIANS,
      spreadMil: Math.atan(spreadMeters / distanceMeters) / MIL_RADIANS,
      spreadWideMeters: Math.abs(lowWide.dropMeters - highWide.dropMeters),
    });
  }
  return rows;
}
