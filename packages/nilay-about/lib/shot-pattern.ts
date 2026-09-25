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
  'setup',
  'distanceM',
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
      inert(record.setup ?? ''),
      record.distanceM === undefined ? '' : round(record.distanceM),
      inert(record.note),
      record.shots.map((shot) => `${round(shot.x)},${round(shot.y)}`).join(' '),
    ].map(escapeField);
  });
  return [csvColumns.join(','), ...rows.map((row) => row.join(','))].join('\n');
}

export interface DensityCell {
  /** Centre of the cell, in cm from the circle centre, x to the right and y upwards. */
  x: number;
  y: number;
  count: number;
  /** Whether the cell's centre lies inside the pattern circle; only those are counted in `max`. */
  inCircle: boolean;
}

export interface DensityGrid {
  cellCm: number;
  cells: DensityCell[];
  /** The most shots in one cell inside the circle. */
  max: number;
  /** Cells inside the circle with no shot in them. */
  emptyCells: number;
  cellsInCircle: number;
}

/**
 * Shots counted in square cells over the circle, the grid centred on the circle centre. The cell size
 * is the reader's choice: the count per cell depends on it, so maps are only comparable at one size.
 */
export function densityGrid(shots: readonly ShotOffset[], diameterCm: number, cellCm: number): DensityGrid | null {
  if (!(diameterCm > 0) || !(cellCm > 0) || !Number.isFinite(diameterCm) || !Number.isFinite(cellCm)) return null;
  const radius = diameterCm / 2;
  const half = Math.ceil(radius / cellCm - 0.5);
  const cells: DensityCell[] = [];
  for (let row = half; row >= -half; row--)
    for (let column = -half; column <= half; column++) {
      const x = column * cellCm;
      const y = row * cellCm;
      cells.push({ x, y, count: 0, inCircle: Math.hypot(x, y) <= radius });
    }
  const side = 2 * half + 1;
  for (const shot of shots) {
    const column = Math.round(shot.x / cellCm) + half;
    const row = half - Math.round(shot.y / cellCm);
    if (column < 0 || column >= side || row < 0 || row >= side) continue;
    const cell = cells[row * side + column];
    if (cell) cell.count += 1;
  }
  const inside = cells.filter((cell) => cell.inCircle);
  return {
    cellCm,
    cells,
    max: Math.max(0, ...inside.map((cell) => cell.count)),
    emptyCells: inside.filter((cell) => cell.count === 0).length,
    cellsInCircle: inside.length,
  };
}

export interface GapAnalysis {
  gapDiameterCm: number;
  /**
   * Share of the places a disc of the gap diameter can sit wholly inside the circle where it would
   * hold no shot: the chance that a target of that size, placed anywhere in the circle, is missed by
   * every pellet in this pattern.
   */
  gapShare: number;
  /** Centres of the empty discs found, for drawing. */
  gaps: { x: number; y: number }[];
  /** The largest empty circle inside the pattern circle, from the same sampling. */
  largest: { x: number; y: number; diameterCm: number } | null;
}

/** Sampling step for the gap search, in cm: fine against any target size a pattern is judged by. */
export const GAP_STEP_CM = 1;

/**
 * Where the pattern leaves holes a target could slip through. Centres are sampled every GAP_STEP_CM
 * across the circle; at each the distance to the nearest shot is measured. A disc of the gap diameter
 * is empty there when that distance is more than its radius. The largest empty circle is the sample
 * with the greatest room to the nearest shot or to the edge of the pattern circle, whichever is less.
 */
export function gapAnalysis(
  shots: readonly ShotOffset[],
  diameterCm: number,
  gapDiameterCm: number,
): GapAnalysis | null {
  if (!(diameterCm > 0) || !(gapDiameterCm > 0) || !Number.isFinite(diameterCm) || !Number.isFinite(gapDiameterCm))
    return null;
  const radius = diameterCm / 2;
  const gapRadius = gapDiameterCm / 2;
  const reach = Math.floor(radius / GAP_STEP_CM);
  const inside = shots.filter((shot) => Number.isFinite(shot.x) && Number.isFinite(shot.y));
  let sampled = 0;
  let empty = 0;
  const gaps: { x: number; y: number }[] = [];
  let largest: GapAnalysis['largest'] = null;
  for (let i = -reach; i <= reach; i++)
    for (let j = -reach; j <= reach; j++) {
      const x = i * GAP_STEP_CM;
      const y = j * GAP_STEP_CM;
      const fromCentre = Math.hypot(x, y);
      if (fromCentre > radius) continue;
      let nearest = Infinity;
      for (const shot of inside) nearest = Math.min(nearest, Math.hypot(shot.x - x, shot.y - y));
      const room = Math.min(nearest, radius - fromCentre);
      if (!largest || room * 2 > largest.diameterCm) largest = { x, y, diameterCm: room * 2 };
      if (fromCentre + gapRadius > radius) continue;
      sampled += 1;
      if (nearest > gapRadius) {
        empty += 1;
        gaps.push({ x, y });
      }
    }
  return { gapDiameterCm, gapShare: sampled > 0 ? empty / sampled : 0, gaps, largest };
}

export interface ChokePlanCell {
  distanceM: number;
  /** Mean pattern percentage of the records at this distance, or null with none. */
  percent: number | null;
  records: number;
}

export interface ChokePlanRow {
  setup: string;
  cells: ChokePlanCell[];
}

/** Records within this of a planned distance count for it: a pattern board is placed by pacing or a tape. */
export const PLAN_DISTANCE_TOLERANCE_M = 2.5;

/**
 * The reader's own measured pattern percentages, by setup and planned distance. Nothing is interpolated
 * or taken from a table: a distance with no record near it stays empty, and only records with a setup,
 * a distance and a pellet count take part.
 */
export function chokePlan(records: readonly PatternRecord[], distancesM: readonly number[]): ChokePlanRow[] {
  const usable = records.filter(
    (record) => record.setup && record.distanceM !== undefined && record.pellets !== null && record.pellets > 0,
  );
  const setups = [...new Set(usable.map((record) => record.setup!))].sort((a, b) => a.localeCompare(b));
  return setups.map((setup) => ({
    setup,
    cells: distancesM.map((distanceM) => {
      const near = usable.filter(
        (record) =>
          record.setup === setup && Math.abs((record.distanceM ?? Infinity) - distanceM) <= PLAN_DISTANCE_TOLERANCE_M,
      );
      const percents = near.map(
        (record) =>
          summarisePattern(record.shots, { diameterCm: record.diameterCm, pellets: record.pellets }).patternPercentage!,
      );
      return {
        distanceM,
        percent: percents.length > 0 ? percents.reduce((sum, value) => sum + value, 0) / percents.length : null,
        records: percents.length,
      };
    }),
  }));
}
