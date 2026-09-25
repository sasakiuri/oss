import { distanceBetween, type Point } from './shot-group';

export type { Point } from './shot-group';

/**
 * Lengths read off a photograph against something of known size in the same picture.
 *
 * A photo has one scale only where the reference and the thing measured stand at the same distance
 * from the camera, in a plane square to it. Everything here assumes that and nothing checks it: a
 * reference held a step nearer than the animal, or an antler pointing towards the lens, reads short
 * or long by however far the picture departs from it, which is the first limit shown on screen.
 */

/** The length of a path through the points, in the units the points are in. Fewer than two points have none. */
export function polylineLength(points: readonly Point[]): number {
  if (points.length < 2 || points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) return NaN;
  let total = 0;
  for (let index = 1; index < points.length; index += 1) total += distanceBetween(points[index - 1]!, points[index]!);
  return total;
}

/** Centimetres per photo pixel from the two ends of the reference and its real length in centimetres. */
export function scaleCmPerPixel(a: Point, b: Point, referenceCm: number): number | null {
  const pixels = distanceBetween(a, b);
  if (!Number.isFinite(referenceCm) || referenceCm <= 0 || !Number.isFinite(pixels) || pixels <= 0) return null;
  return referenceCm / pixels;
}

/** A traced path in centimetres, or null until the scale is set and the path has two points. */
export function measurePathCm(points: readonly Point[], cmPerPixel: number | null): number | null {
  if (cmPerPixel === null) return null;
  const pixels = polylineLength(points);
  return Number.isFinite(pixels) ? pixels * cmPerPixel : null;
}

export type BoarSex = 'male' | 'female';

/**
 * Abe (1986), "External measurements of the Japanese wild boar: regression of body weight and head
 * and body length and allometry", Journal of the Mammalogical Society of Japan 11(3-4): 147–154,
 * https://doi.org/10.11238/jmammsocjapan1952.11.147. Common logarithms, weight in kg and head and
 * body length (tip of the snout to the anus) in cm, measured on boars hung by the lower jaw. Boars
 * taken for food in Hyogo and Kyoto in the 1975/76 season; 53 males and 44 females were weighed.
 * The weights are of carcasses with the chest and abdominal organs already removed, so the estimate
 * is of that, not of a live animal.
 */
export const ABE_1986_BOAR = {
  male: { slope: 3.38, intercept: -5.34, standardError: 0.06, minLengthCm: 60, maxLengthCm: 151 },
  female: { slope: 3.35, intercept: -5.3, standardError: 0.05, minLengthCm: 60, maxLengthCm: 135 },
} as const;

export interface BoarWeightEstimate {
  kg: number;
  /** One standard error of the estimate either side, which the paper gives on the log scale. */
  lowKg: number;
  highKg: number;
}

/**
 * The eviscerated weight the regression gives for a head and body length. Lengths outside those
 * the paper measured (60–151 cm in males, 60–135 cm in females) get no estimate: the fit says
 * nothing about animals it never saw.
 */
export function estimateBoarWeight(lengthCm: number, sex: BoarSex): BoarWeightEstimate | null {
  const fit = ABE_1986_BOAR[sex];
  if (!Number.isFinite(lengthCm) || lengthCm < fit.minLengthCm || lengthCm > fit.maxLengthCm) return null;
  const log = fit.slope * Math.log10(lengthCm) + fit.intercept;
  return { kg: 10 ** log, lowKg: 10 ** (log - fit.standardError), highKg: 10 ** (log + fit.standardError) };
}

/**
 * The extent of a shape along its own long axis, and the two points that bound it there.
 *
 * The axis is the principal axis of the pixels (the direction they spread furthest in), and the
 * extent is the distance between the outermost pixels projected onto it. On a side view of a
 * standing animal that runs roughly nose to rump, but it is the length of the outline, not a body
 * measurement: an outstretched tail, a lowered head or legs mid-stride change it. The screen offers
 * the two ends as a starting point for the reader to move onto the nose and the anus.
 */
export function principalExtent(
  mask: Uint8Array | readonly number[],
  width: number,
  height: number,
): { start: Point; end: Point; lengthPx: number } | null {
  if (!(width > 0) || !(height > 0) || mask.length !== width * height) return null;
  let count = 0;
  let sumX = 0;
  let sumY = 0;
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1)
      if (mask[y * width + x]) {
        count += 1;
        sumX += x;
        sumY += y;
      }
  if (count < 2) return null;
  const meanX = sumX / count;
  const meanY = sumY / count;
  let xx = 0;
  let yy = 0;
  let xy = 0;
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1)
      if (mask[y * width + x]) {
        const dx = x - meanX;
        const dy = y - meanY;
        xx += dx * dx;
        yy += dy * dy;
        xy += dx * dy;
      }
  // The direction of greatest spread of a 2 × 2 covariance matrix, in closed form.
  const angle = 0.5 * Math.atan2(2 * xy, xx - yy);
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  let min = Infinity;
  let max = -Infinity;
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1)
      if (mask[y * width + x]) {
        const along = (x - meanX) * ux + (y - meanY) * uy;
        if (along < min) min = along;
        if (along > max) max = along;
      }
  if (!(max > min)) return null;
  return {
    start: { x: meanX + ux * min, y: meanY + uy * min },
    end: { x: meanX + ux * max, y: meanY + uy * max },
    lengthPx: max - min,
  };
}
