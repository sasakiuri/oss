import type { PatternRecord, ShotOffset } from './schemas/shot-pattern';

export type { PatternRecord, ShotOffset } from './schemas/shot-pattern';

/** The 30 inch pattern circle used for shotgun pattern testing. */
export const PATTERN_DIAMETER_CM = 76.2;

export interface Point {
  x: number;
  y: number;
}

export type Quadrant = 'upperLeft' | 'upperRight' | 'lowerLeft' | 'lowerRight';

export interface PatternSummary {
  total: number;
  inside: number;
  outside: number;
  inner: number;
  outer: number;
  /** Share of the shots inside the circle that also fall in the inner half of its area. */
  innerShare: number | null;
  quadrants: Record<Quadrant, number>;
  centroid: { x: number; y: number; distance: number } | null;
  patternPercentage: number | null;
  innerDiameterCm: number;
}

export function distanceBetween(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Centimetres per pixel from two marked points and the real distance between them. */
export function getScale(a: Point, b: Point, referenceCm: number): number | null {
  const pixels = distanceBetween(a, b);
  if (!Number.isFinite(referenceCm) || referenceCm <= 0 || !Number.isFinite(pixels) || pixels <= 0) return null;
  return referenceCm / pixels;
}

/** Image pixels to centimetres measured from the circle centre, x to the right and y upwards. */
export function toOffsetCm(point: Point, centre: Point, cmPerPixel: number): ShotOffset {
  return { x: (point.x - centre.x) * cmPerPixel, y: (centre.y - point.y) * cmPerPixel };
}

export function toImagePoint(offset: ShotOffset, centre: Point, cmPerPixel: number): Point {
  return { x: centre.x + offset.x / cmPerPixel, y: centre.y - offset.y / cmPerPixel };
}

/** A circle of this diameter covers exactly half the area of the pattern circle. */
export function getInnerDiameterCm(diameterCm: number): number {
  return diameterCm * Math.SQRT1_2;
}

export function summarisePattern(
  shots: readonly ShotOffset[],
  { diameterCm, pellets = null }: { diameterCm: number; pellets?: number | null },
): PatternSummary {
  const radius = diameterCm / 2;
  const innerRadius = getInnerDiameterCm(diameterCm) / 2;
  const quadrants: Record<Quadrant, number> = { upperLeft: 0, upperRight: 0, lowerLeft: 0, lowerRight: 0 };
  let inside = 0;
  let inner = 0;
  let sumX = 0;
  let sumY = 0;
  for (const shot of shots) {
    const distance = Math.hypot(shot.x, shot.y);
    // A shot on the line counts as a hit; a non-finite coordinate never compares true.
    if (!(distance <= radius)) continue;
    inside += 1;
    if (distance <= innerRadius) inner += 1;
    sumX += shot.x;
    sumY += shot.y;
    // Shots exactly on an axis are counted once, towards the upper right.
    quadrants[`${shot.y >= 0 ? 'upper' : 'lower'}${shot.x >= 0 ? 'Right' : 'Left'}` as Quadrant] += 1;
  }
  const centroid = inside > 0 ? { x: sumX / inside, y: sumY / inside } : null;
  return {
    total: shots.length,
    inside,
    outside: shots.length - inside,
    inner,
    outer: inside - inner,
    innerShare: inside > 0 ? inner / inside : null,
    quadrants,
    centroid: centroid ? { ...centroid, distance: Math.hypot(centroid.x, centroid.y) } : null,
    patternPercentage: pellets !== null && Number.isFinite(pellets) && pellets > 0 ? (inside / pellets) * 100 : null,
    innerDiameterCm: getInnerDiameterCm(diameterCm),
  };
}

const round = (value: number | null, digits = 2) =>
  value === null || !Number.isFinite(value) ? '' : String(Number(value.toFixed(digits)));

const escapeField = (value: string) => (/["\r\n,]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

// A spreadsheet runs a leading =, +, - or @ as a formula, so text a person typed is kept inert.
const inert = (value: string) => (/^[=+\-@\t\r]/.test(value) ? `'${value}` : value);

const csvColumns = [
  'name',
  'savedAt',
  'diameterCm',
  'innerDiameterCm',
  'pellets',
  'total',
  'inside',
  'outside',
  'inner',
  'outer',
  'innerShare',
  'patternPercent',
  'centroidRightCm',
  'centroidUpCm',
  'centroidOffsetCm',
  'upperLeft',
  'upperRight',
  'lowerLeft',
  'lowerRight',
  'note',
  'shotsCm',
] as const;

export function buildRecordsCsv(records: readonly PatternRecord[]): string {
  const rows = records.map((record) => {
    const summary = summarisePattern(record.shots, { diameterCm: record.diameterCm, pellets: record.pellets });
    return [
      inert(record.name),
      record.savedAt,
      round(record.diameterCm),
      round(summary.innerDiameterCm),
      record.pellets === null ? '' : String(record.pellets),
      String(summary.total),
      String(summary.inside),
      String(summary.outside),
      String(summary.inner),
      String(summary.outer),
      round(summary.innerShare, 4),
      round(summary.patternPercentage, 1),
      round(summary.centroid?.x ?? null),
      round(summary.centroid?.y ?? null),
      round(summary.centroid?.distance ?? null),
      String(summary.quadrants.upperLeft),
      String(summary.quadrants.upperRight),
      String(summary.quadrants.lowerLeft),
      String(summary.quadrants.lowerRight),
      inert(record.note),
      record.shots.map((shot) => `${round(shot.x)},${round(shot.y)}`).join(' '),
    ].map(escapeField);
  });
  return [csvColumns.join(','), ...rows.map((row) => row.join(','))].join('\n');
}
