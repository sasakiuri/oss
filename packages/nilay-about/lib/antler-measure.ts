import { distanceBetween, getScale, type Point } from './shot-group';

export type { Point } from './shot-group';

/** The length along a line through the points, in pixels of the photo. */
export function polylineLength(points: readonly Point[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index++) total += distanceBetween(points[index - 1]!, points[index]!);
  return total;
}

/** Centimetres per photo pixel from the two ends of a reference object of known length. */
export function centimetresPerPixel(a: Point, b: Point, referenceCm: number): number | null {
  const mmPerPixel = getScale(a, b, referenceCm * 10);
  return mmPerPixel === null ? null : mmPerPixel / 10;
}

/** A traced line's length in centimetres, or `null` without a scale or with fewer than two points. */
export function measuredCentimetres(points: readonly Point[], cmPerPixel: number | null): number | null {
  if (cmPerPixel === null || points.length < 2) return null;
  return polylineLength(points) * cmPerPixel;
}
