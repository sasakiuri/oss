/**
 * The arithmetic of a drive hunt plan: drawing lots for the stands, and laying the stands out on a
 * small plan in metres for the printed sheet.
 */

import { arcPoints, type GeoPoint } from './geodesy';
import type { NoFireSector, Participant, Stand } from './schemas/drive-hunt';
import { transverseMercator } from './transverse-mercator';

/**
 * Deals the stand-takers out to the stands at random: a Fisher–Yates shuffle of the people, then
 * one per stand in stand order. With more people than stands the rest are left without; with fewer,
 * the last stands stay empty. `random` returns a number in [0, 1).
 */
export function drawLots(
  stands: readonly Stand[],
  participants: readonly Participant[],
  random: () => number,
): Map<string, string | null> {
  const people = participants
    .filter((participant) => participant.role === 'stand')
    .map((participant) => participant.id);
  for (let index = people.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [people[index], people[other]] = [people[other]!, people[index]!];
  }
  return new Map(stands.map((stand, index) => [stand.id, people[index] ?? null]));
}

/** A uniform number in [0, 1) from the browser's cryptographic generator, so no one can steer the draw. */
export function secureRandom(): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0]! / 2 ** 32;
}

/** The wedge of a no-fire sector as a ring for the map: the stand, then the arc. */
export function sectorRing(stand: GeoPoint, sector: NoFireSector, length: number): GeoPoint[] {
  return [{ ...stand }, ...arcPoints(stand, sector.from, sector.to, length, 3)];
}

/** Degrees swept clockwise from `from` to `to`. */
export function sectorSweep(sector: NoFireSector): number {
  const sweep = (((sector.to - sector.from) % 360) + 360) % 360;
  return sweep === 0 && sector.to !== sector.from ? 360 : sweep;
}

/**
 * Stand positions in metres east and north of their centre, for a plan drawn to scale. A transverse
 * Mercator about the centre keeps a few kilometres true to well under a metre.
 */
export function localPlan(points: readonly GeoPoint[]): { east: number; north: number }[] {
  if (points.length === 0) return [];
  const centre = {
    latitude: points.reduce((sum, point) => sum + point.latitude, 0) / points.length,
    longitude: points.reduce((sum, point) => sum + point.longitude, 0) / points.length,
  };
  return points.map((point) => {
    const { x, y } = transverseMercator(point, centre);
    return { east: y, north: x };
  });
}
