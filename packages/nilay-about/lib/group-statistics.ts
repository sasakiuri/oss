/**
 * What a measured group is allowed to say about the rifle that fired it.
 *
 * lib/shot-group.ts measures the group that is on the paper: how far apart the holes are and
 * where their centre sits. Those figures are exact for the shots that were fired, and that is
 * all they are. A second group from the same rifle lands somewhere else, so a mean point of
 * impact off to the right by 12 mm may be a sight that needs turning or may be the three shots
 * that happened to be fired. This module separates the two, and says how many more shots it
 * would take to tell them apart.
 *
 * Two models are used, and they are not equally demanding:
 *
 *   - The interval on the mean point of impact treats each axis on its own and assumes only that
 *     the shots on that axis are independent draws from one normal distribution. It does not care
 *     whether the group is round or oval. This is the figure the sight correction rests on.
 *   - Everything about the size of the group - the Rayleigh σ, the expected extreme spread and the
 *     mean radius - assumes on top of that that the dispersion is the same in both directions
 *     (σx = σy), which is the symmetric bivariate normal, or Rayleigh, model that the shooting
 *     literature uses. A group that is plainly taller than it is wide breaks that assumption, so
 *     axisRatio is reported and flagged for the screen to pass on.
 *
 * Sources, all retrieved 2026-09-22:
 *   - Ballistipedia, "Closed Form Precision" (https://ballistipedia.com/wiki/Closed_Form_Precision/)
 *     for the Rayleigh model: the unbiased estimate σ̂ = c_G(2n-1) √((s_x² + s_y²)/2), the χ²
 *     confidence interval on σ with 2(n-1) degrees of freedom, the mean radius MR = σ √(π/2) and
 *     the expected sample mean radius MR_n = σ √(π(n-1)/(2n)) of a group of n shots.
 *   - Ballistipedia, "Range Statistics" (https://ballistipedia.com/wiki/Range_Statistics/) and the
 *     table it distributes as Media:Sigma1RangeStatistics.xls for the distribution of the extreme
 *     spread at σ = 1, which is what makes a three shot group comparable with a ten shot group.
 *   - NIST/SEMATECH e-Handbook of Statistical Methods, 1.3.6.7.2 and 1.3.6.7.4, for the published
 *     critical values of the t and χ² distributions that the functions here are tested against.
 *
 * The distribution functions are implemented here rather than taken from a package: the tool ships
 * no other statistics dependency, and a published table of critical values is a far better test of
 * an implementation than another implementation would be.
 */

import type { ShotImpact } from './schemas/shot-group';

/** The interval every figure in this module is quoted at. Fixed: a chooser here would only invite
 *  reading the one that says what the reader hoped, and 95 % is what the shooting literature uses. */
export const CONFIDENCE_LEVEL = 0.95;

/* ------------------------------------------------------------------ *
 * Distribution functions
 * ------------------------------------------------------------------ */

/**
 * Lanczos approximation to ln Γ(x), g = 7 with nine coefficients, which holds to about fifteen
 * digits for the arguments used here. Every call below has x > 0; the reflection keeps the
 * function total rather than because a negative argument is expected.
 */
const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
  12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
] as const;

export function logGamma(x: number): number {
  if (!Number.isFinite(x)) return NaN;
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - logGamma(1 - x);
  const z = x - 1;
  let series = LANCZOS[0];
  for (let index = 1; index < LANCZOS.length; index += 1) series += (LANCZOS[index] ?? 0) / (z + index);
  const t = z + LANCZOS.length - 1.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(series);
}

/** Iteration caps. Both continued fractions below converge in tens of steps for these arguments;
 *  the cap only stops a pathological input from spinning. */
const MAX_ITERATIONS = 300;
const TINY = 1e-300;
const RELATIVE_EPSILON = 3e-16;

/** The continued fraction of the incomplete beta function, evaluated by the modified Lentz method. */
function betaContinuedFraction(a: number, b: number, x: number): number {
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < TINY) d = TINY;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAX_ITERATIONS; m += 1) {
    const m2 = 2 * m;
    const even = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + even * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + even / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    h *= d * c;
    const odd = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + odd * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + odd / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < RELATIVE_EPSILON) break;
  }
  return h;
}

/** The regularized incomplete beta function I_x(a, b), which is the CDF of the beta distribution. */
export function regularizedIncompleteBeta(a: number, b: number, x: number): number {
  if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(x) || a <= 0 || b <= 0) return NaN;
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = (first: number, second: number, value: number) =>
    Math.exp(
      logGamma(first + second) -
        logGamma(first) -
        logGamma(second) +
        first * Math.log(value) +
        second * Math.log1p(-value),
    );
  // The fraction converges quickly only on one side of this point, so the other side is reached
  // through the symmetry I_x(a, b) = 1 - I_(1-x)(b, a).
  return x < (a + 1) / (a + b + 2)
    ? (front(a, b, x) * betaContinuedFraction(a, b, x)) / a
    : 1 - (front(b, a, 1 - x) * betaContinuedFraction(b, a, 1 - x)) / b;
}

/** P(T ≤ t) for Student's t with `df` degrees of freedom. */
export function studentTCdf(t: number, df: number): number {
  if (!Number.isFinite(t) || !Number.isFinite(df) || df <= 0) return NaN;
  const tail = 0.5 * regularizedIncompleteBeta(df / 2, 0.5, df / (df + t * t));
  return t >= 0 ? 1 - tail : tail;
}

/**
 * Solve a monotonically rising CDF for the value at probability p.
 *
 * Bisection rather than Newton's method: it cannot leave the bracket, it needs no derivative, and
 * sixty halvings of an interval that starts at the scale of the answer already reach the precision
 * of a double. Nothing here is called often enough for the speed to matter.
 */
function invertByBisection(cdf: (value: number) => number, p: number, start: number): number {
  let high = start;
  // The upper end is pushed out until it covers p, so a tail probability close to 1 still brackets.
  for (let step = 0; step < 200 && cdf(high) < p; step += 1) high *= 2;
  let low = 0;
  for (let step = 0; step < 200 && high - low > Math.abs(high) * 1e-13; step += 1) {
    const middle = (low + high) / 2;
    if (cdf(middle) < p) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

/** The value t with P(T ≤ t) = p, for Student's t with `df` degrees of freedom. */
export function studentTQuantile(p: number, df: number): number {
  if (!Number.isFinite(p) || !Number.isFinite(df) || p <= 0 || p >= 1 || df <= 0) return NaN;
  if (p === 0.5) return 0;
  // The distribution is symmetric about zero, so only the upper half is ever solved.
  if (p < 0.5) return -studentTQuantile(1 - p, df);
  return invertByBisection((value) => studentTCdf(value, df), p, 1);
}

/** The series for the lower incomplete gamma, which converges quickly while x is below a + 1. */
function lowerGammaSeries(a: number, x: number): number {
  let term = 1 / a;
  let sum = term;
  for (let n = 1; n <= MAX_ITERATIONS; n += 1) {
    term *= x / (a + n);
    sum += term;
    if (Math.abs(term) < Math.abs(sum) * RELATIVE_EPSILON) break;
  }
  return sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
}

/** The continued fraction for the upper incomplete gamma, used where the series is slow. */
function upperGammaContinuedFraction(a: number, x: number): number {
  let b = x + 1 - a;
  let c = 1 / TINY;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i <= MAX_ITERATIONS; i += 1) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < TINY) d = TINY;
    c = b + an / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < RELATIVE_EPSILON) break;
  }
  return Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
}

/** The regularized lower incomplete gamma P(a, x), which is the CDF of the gamma distribution. */
export function regularizedLowerGamma(a: number, x: number): number {
  if (!Number.isFinite(a) || !Number.isFinite(x) || a <= 0) return NaN;
  if (x <= 0) return 0;
  return x < a + 1 ? lowerGammaSeries(a, x) : 1 - upperGammaContinuedFraction(a, x);
}

/** P(X ≤ x) for χ² with `df` degrees of freedom. */
export function chiSquaredCdf(x: number, df: number): number {
  if (!Number.isFinite(df) || df <= 0) return NaN;
  return regularizedLowerGamma(df / 2, x / 2);
}

/** The value x with P(X ≤ x) = p, for χ² with `df` degrees of freedom. */
export function chiSquaredQuantile(p: number, df: number): number {
  if (!Number.isFinite(p) || !Number.isFinite(df) || p <= 0 || p >= 1 || df <= 0) return NaN;
  return invertByBisection((value) => chiSquaredCdf(value, df), p, df + 1);
}

/**
 * The Gaussian correction factor c_G(n), the reciprocal of the c₄ that statistical quality control
 * tables list. Taking the square root of an unbiased variance gives a standard deviation that reads
 * low, and this puts it back. Ballistipedia, "Closed Form Precision", gives it as
 * c_G(n) = exp(lnΓ((n-1)/2) - ln√(2/(n-1)) - lnΓ(n/2)) and notes it is above 1 for every n and
 * approaches 1 as the sample grows.
 */
export function gaussianCorrection(n: number): number {
  if (!Number.isFinite(n) || n <= 1) return NaN;
  return Math.exp(logGamma((n - 1) / 2) - Math.log(Math.sqrt(2 / (n - 1))) - logGamma(n / 2));
}

/* ------------------------------------------------------------------ *
 * The published distribution of the extreme spread
 * ------------------------------------------------------------------ */

/**
 * The extreme spread of a group of n shots, in multiples of σ, from the table Ballistipedia
 * distributes as Media:Sigma1RangeStatistics.xls (linked from "Range Statistics", retrieved
 * 2026-09-22). The columns are the 2.5th, 25th, 50th, 75th and 97.5th percentiles and the mean;
 * the file's own headings name the percentiles as bands around the median, so its "-25%" column
 * is the 25th percentile and its "+47.5%" column the 97.5th.
 *
 * Every value is that file's value, rounded to six decimals as it stores them. The page's own
 * examples check out against these rows: it states a median of 3.0 σ for five shots, and that a
 * ten shot group averages 1.24 times a five shot group, which these numbers give as 3.012 and
 * 3.811 / 3.066 = 1.243.
 *
 * The file runs to a hundred shots. It is transcribed here to thirty, which is already far beyond
 * the groups this tool is used on, and a larger group simply gets no comparison rather than an
 * extrapolated one.
 */
// prettier-ignore
const EXTREME_SPREAD_SIGMA: Record<number, readonly [p025: number, p25: number, median: number, p75: number, p975: number, mean: number]> = {
  2:  [0.317341, 1.071387, 1.665466, 2.355002, 3.838822, 1.772475],
  3:  [0.880947, 1.763029, 2.337820, 2.978075, 4.338811, 2.408692],
  4:  [1.293670, 2.181767, 2.733707, 3.339733, 4.627463, 2.792686],
  5:  [1.606562, 2.480885, 3.012307, 3.592351, 4.832247, 3.066255],
  6:  [1.851988, 2.708894, 3.224410, 3.786672, 4.991232, 3.275918],
  7:  [2.054731, 2.891812, 3.394366, 3.941468, 5.117666, 3.444070],
  8:  [2.227467, 3.046474, 3.536971, 4.072048, 5.227523, 3.586174],
  9:  [2.370586, 3.175821, 3.656699, 4.181657, 5.319585, 3.705391],
  10: [2.501422, 3.288135, 3.763395, 4.279413, 5.396995, 3.811162],
  11: [2.607001, 3.390512, 3.857037, 4.365885, 5.468220, 3.903902],
  12: [2.713363, 3.480791, 3.941047, 4.442656, 5.531606, 3.988186],
  13: [2.801614, 3.563993, 4.015986, 4.511617, 5.597773, 4.063824],
  14: [2.887034, 3.638547, 4.085857, 4.577106, 5.645379, 4.133272],
  15: [2.964121, 3.706810, 4.149149, 4.635077, 5.696402, 4.196044],
  16: [3.036317, 3.771224, 4.208376, 4.688231, 5.745351, 4.255408],
  17: [3.100203, 3.827640, 4.260679, 4.737164, 5.784219, 4.308138],
  18: [3.160446, 3.882593, 4.312862, 4.785684, 5.820993, 4.359685],
  19: [3.220577, 3.934096, 4.358803, 4.827903, 5.860826, 4.406355],
  20: [3.272487, 3.981760, 4.404155, 4.869522, 5.893964, 4.450677],
  21: [3.324345, 4.025767, 4.445772, 4.908252, 5.930088, 4.492804],
  22: [3.373430, 4.069655, 4.486303, 4.946304, 5.961672, 4.533562],
  23: [3.418863, 4.109680, 4.524192, 4.980385, 5.984124, 4.570659],
  24: [3.461281, 4.148887, 4.561582, 5.016446, 6.017823, 4.608031],
  25: [3.503457, 4.186254, 4.595157, 5.044907, 6.043877, 4.640952],
  26: [3.540967, 4.219865, 4.625576, 5.076308, 6.070839, 4.673181],
  27: [3.579807, 4.253571, 4.657222, 5.102440, 6.095421, 4.703566],
  28: [3.614119, 4.284838, 4.687824, 5.131295, 6.121617, 4.733996],
  29: [3.649539, 4.315400, 4.715737, 5.158750, 6.142577, 4.762321],
  30: [3.682397, 4.345499, 4.743231, 5.182706, 6.160450, 4.789366],
};

/** The largest group the transcribed table covers. */
export const PUBLISHED_GROUP_SIZE_LIMIT = 30;

/** The group sizes the screen compares against: the three the shooting world argues about. */
export const COMPARISON_GROUP_SIZES = [3, 5, 10] as const;

export interface ExtremeSpreadExpectation {
  groupSize: number;
  /** The average extreme spread of many groups of this size fired by a rifle of this σ. */
  meanMm: number;
  medianMm: number;
  /** The middle half of groups of this size falls between these two. */
  p25Mm: number;
  p75Mm: number;
  /** Nineteen groups in twenty fall between these two. */
  p025Mm: number;
  p975Mm: number;
}

/** What a rifle of this σ does over many groups of this size, or null outside the published table. */
export function expectedExtremeSpread(sigmaMm: number, groupSize: number): ExtremeSpreadExpectation | null {
  const row = EXTREME_SPREAD_SIGMA[groupSize];
  if (row === undefined || !Number.isFinite(sigmaMm) || sigmaMm < 0) return null;
  const [p025, p25, median, p75, p975, mean] = row;
  return {
    groupSize,
    meanMm: mean * sigmaMm,
    medianMm: median * sigmaMm,
    p25Mm: p25 * sigmaMm,
    p75Mm: p75 * sigmaMm,
    p025Mm: p025 * sigmaMm,
    p975Mm: p975 * sigmaMm,
  };
}

/*
 * There is deliberately nothing here that places the group's own extreme spread inside this
 * distribution. The σ it would be measured against is estimated from those same shots, so the two
 * move together and the group would land in the middle band almost however it was shot. The bands
 * are used the other way round instead: as what the next group of that size should measure.
 */

/* ------------------------------------------------------------------ *
 * The group in hand
 * ------------------------------------------------------------------ */

export interface AxisEstimate {
  /** Mean offset from the aim point on this axis: positive is right, or up. */
  meanMm: number;
  sdMm: number;
  /** Half the width of the confidence interval: t × s / √n. */
  halfWidthMm: number;
  lowMm: number;
  highMm: number;
  /**
   * True when the interval reaches across zero, which is the case where the group is not far
   * enough off the aim point to say the sight is off rather than the shooting.
   */
  spansZero: boolean;
  /**
   * Set when every shot landed on the same line on this axis, which leaves the interval no width
   * at all. Taken literally that would claim the centre is known exactly from two shots; it means
   * instead that this group has nothing to say about the dispersion, so the screen has to refuse
   * the verdict rather than read the interval out.
   */
  degenerate: boolean;
}

export interface GroupStatistics {
  count: number;
  horizontal: AxisEstimate;
  vertical: AxisEstimate;
  /**
   * The unbiased Rayleigh estimate of σ, the standard deviation of a single shot about the centre
   * of impact along one axis, with the interval it is known to.
   */
  sigmaMm: number;
  sigmaLowMm: number;
  sigmaHighMm: number;
  /** The mean radius the rifle would settle at over many shots: σ √(π/2). */
  meanRadiusMm: number;
  meanRadiusLowMm: number;
  meanRadiusHighMm: number;
  /**
   * The mean radius a group of this many shots is expected to measure. It is smaller than the one
   * above because the radii are measured from the group's own centre rather than the true one, and
   * that centre sits inside the group.
   */
  sampleMeanRadiusMm: number;
  /** The larger axis deviation over the smaller, which is 1 for a perfectly round group. */
  axisRatio: number;
  /** Set when the group is far enough from round that the figures resting on σx = σy are doubtful. */
  circularModelDoubtful: boolean;
}

/**
 * How far from round a group may read before the symmetric model behind σ is called into question.
 * Editorial, not a test: two axes of five shots each differ by this much often enough by chance,
 * so this raises a caution about the figures that assume a round group and never suppresses them.
 */
export const AXIS_RATIO_CAUTION = 1.8;

const usableImpacts = (impacts: readonly ShotImpact[]) =>
  impacts.filter((impact) => Number.isFinite(impact.x) && Number.isFinite(impact.y));

/**
 * The statistics of a measured group, or null before two shots make them mean anything.
 *
 * The coordinates are read again rather than taken from summariseGroup: the sums of squares this
 * needs are not in that summary, and reading them from the same millimetres keeps the two from
 * drifting apart.
 */
export function summariseStatistics(
  impacts: readonly ShotImpact[],
  { level = CONFIDENCE_LEVEL }: { level?: number } = {},
): GroupStatistics | null {
  const usable = usableImpacts(impacts);
  const count = usable.length;
  if (count < 2 || !(level > 0 && level < 1)) return null;

  const meanOf = (pick: (impact: ShotImpact) => number) =>
    usable.reduce((sum, impact) => sum + pick(impact), 0) / count;
  const sumSquares = (pick: (impact: ShotImpact) => number, mean: number) =>
    usable.reduce((sum, impact) => sum + (pick(impact) - mean) ** 2, 0);

  const meanX = meanOf((impact) => impact.x);
  const meanY = meanOf((impact) => impact.y);
  const squaresX = sumSquares((impact) => impact.x, meanX);
  const squaresY = sumSquares((impact) => impact.y, meanY);
  const sdX = Math.sqrt(squaresX / (count - 1));
  const sdY = Math.sqrt(squaresY / (count - 1));

  // Two tails, so the interval runs between the (1 - level)/2 and (1 + level)/2 points.
  const t = studentTQuantile((1 + level) / 2, count - 1);
  const axis = (meanMm: number, sdMm: number): AxisEstimate => {
    const halfWidthMm = (t * sdMm) / Math.sqrt(count);
    const lowMm = meanMm - halfWidthMm;
    const highMm = meanMm + halfWidthMm;
    return {
      meanMm,
      sdMm,
      halfWidthMm,
      lowMm,
      highMm,
      spansZero: lowMm <= 0 && highMm >= 0,
      degenerate: sdMm === 0,
    };
  };

  // The sum of the squared radii about the group centre, which is what the Rayleigh interval uses.
  const sumRadiiSquared = squaresX + squaresY;
  const degreesOfFreedom = 2 * (count - 1);
  const sigmaMm = gaussianCorrection(2 * count - 1) * Math.sqrt(sumRadiiSquared / degreesOfFreedom);
  // A χ² interval is not symmetric: the large critical value gives the small σ and the other way about.
  const sigmaLowMm = Math.sqrt(sumRadiiSquared / chiSquaredQuantile((1 + level) / 2, degreesOfFreedom));
  const sigmaHighMm = Math.sqrt(sumRadiiSquared / chiSquaredQuantile((1 - level) / 2, degreesOfFreedom));

  const meanRadiusFactor = Math.sqrt(Math.PI / 2);
  const sampleFactor = Math.sqrt((Math.PI * (count - 1)) / (2 * count));
  const smaller = Math.min(sdX, sdY);
  const larger = Math.max(sdX, sdY);
  // Two shots that went through the same hole on one axis leave no ratio to take.
  const axisRatio = smaller > 0 ? larger / smaller : larger > 0 ? Infinity : 1;

  return {
    count,
    horizontal: axis(meanX, sdX),
    vertical: axis(meanY, sdY),
    sigmaMm,
    sigmaLowMm,
    sigmaHighMm,
    meanRadiusMm: sigmaMm * meanRadiusFactor,
    meanRadiusLowMm: sigmaLowMm * meanRadiusFactor,
    meanRadiusHighMm: sigmaHighMm * meanRadiusFactor,
    sampleMeanRadiusMm: sigmaMm * sampleFactor,
    axisRatio,
    circularModelDoubtful: axisRatio > AXIS_RATIO_CAUTION,
  };
}

/**
 * What this group settles about one axis: that the sight is off, that the offset is inside what
 * chance produces, or - when every shot fell on the same line - that there is nothing to judge.
 */
export type AxisVerdict = 'decided' | 'chance' | 'no-dispersion';

export function axisVerdict(axis: AxisEstimate): AxisVerdict {
  if (axis.degenerate) return 'no-dispersion';
  return axis.spansZero ? 'chance' : 'decided';
}

/** The two axes taken together, which is what the screen leads with and what a correction rests on. */
export type GroupVerdict = 'no-dispersion' | 'chance-only' | 'vertical-only' | 'horizontal-only' | 'both-axes';

export function groupVerdict(statistics: GroupStatistics): GroupVerdict {
  const vertical = axisVerdict(statistics.vertical);
  const horizontal = axisVerdict(statistics.horizontal);
  if (vertical === 'decided' && horizontal === 'decided') return 'both-axes';
  if (vertical === 'decided') return 'vertical-only';
  if (horizontal === 'decided') return 'horizontal-only';
  // Both axes flat is the only way nothing can be judged at all; one flat axis still leaves the
  // other to report, and it reports that the offset is inside what chance produces.
  return vertical === 'no-dispersion' && horizontal === 'no-dispersion' ? 'no-dispersion' : 'chance-only';
}

/**
 * The most shots this will ask for. Past it the answer is not a shooting plan but an arithmetic
 * one, and the screen says so instead of printing a number nobody will fire.
 */
export const REQUIRED_SHOTS_LIMIT = 200;

/**
 * How many shots it takes for the confidence interval on the mean point of impact to close to
 * ±halfWidthMm on one axis, or null when even the limit above does not reach it.
 *
 * The count enters twice - through √n and through the t value's degrees of freedom - so it is
 * stepped rather than solved. The dispersion is taken as the one measured, which is itself an
 * estimate from a handful of shots: this answers "at this dispersion", not "however the rifle
 * behaves tomorrow", and the screen has to say so.
 */
export function requiredShots(sdMm: number, halfWidthMm: number, level = CONFIDENCE_LEVEL): number | null {
  if (!Number.isFinite(sdMm) || sdMm < 0) return null;
  if (!Number.isFinite(halfWidthMm) || halfWidthMm <= 0) return null;
  if (!(level > 0 && level < 1)) return null;
  for (let count = 2; count <= REQUIRED_SHOTS_LIMIT; count += 1) {
    if ((studentTQuantile((1 + level) / 2, count - 1) * sdMm) / Math.sqrt(count) <= halfWidthMm) return count;
  }
  return null;
}
