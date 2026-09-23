import type { BulletUnit, GroupRecord, ShotImpact } from './schemas/shot-group';
import type { HorizontalImpact, OffsetUnit, VerticalImpact } from './schemas/sight-adjustment';
import { MIL_RADIANS, MM_PER_INCH, MOA_RADIANS, toMeters, toMillimeters } from './sight-adjustment';

export type { BulletUnit, GroupRecord, ShotImpact } from './schemas/shot-group';

export interface Point {
  x: number;
  y: number;
}

export function distanceBetween(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Millimetres per pixel from two marked points and the real distance between them. */
export function getScale(a: Point, b: Point, referenceMm: number): number | null {
  const pixels = distanceBetween(a, b);
  if (!Number.isFinite(referenceMm) || referenceMm <= 0 || !Number.isFinite(pixels) || pixels <= 0) return null;
  return referenceMm / pixels;
}

/** Image pixels to millimetres measured from the aim point, x to the right and y upwards. */
export function toImpactMm(point: Point, aim: Point, mmPerPixel: number): ShotImpact {
  return { x: (point.x - aim.x) * mmPerPixel, y: (aim.y - point.y) * mmPerPixel };
}

export function toImagePoint(impact: ShotImpact, aim: Point, mmPerPixel: number): Point {
  return { x: aim.x + impact.x / mmPerPixel, y: aim.y - impact.y / mmPerPixel };
}

/** The inverse of toMillimeters, for reading a measured length back in the unit the reader chose. */
export function fromMillimeters(millimetres: number, unit: OffsetUnit): number {
  return millimetres / { mm: 1, cm: 10, inch: MM_PER_INCH }[unit];
}

/** A bullet diameter in the unit it was read in. Both of its units are also offset units. */
export function toBulletDiameterMm(value: number, unit: BulletUnit): number {
  return toMillimeters(value, unit);
}

/**
 * A length on the target read as an angle at this distance: the size divided by the distance, which
 * is how the shooting world states a group in MOA or mil.
 *
 * It is not the exact angle between the two holes. The exact one also depends on where the group
 * sits in relation to the line of sight, because holes off to one side stand at slightly different
 * distances from the eye, so a size and a distance alone do not settle it. Across the distances and
 * the offsets from the aim point this tool is used at, the two differ by less than a hundredth of a
 * millimetre of group size, which is far below what reading a hole's centre off a photograph can
 * resolve — and well below the spread between two groups of the same rifle and load.
 *
 * Taking the arctangent rather than the bare ratio also makes this the inverse of angularSizeMm, so
 * a size converted to MOA and back comes out at the length it started from. That is a property of
 * the arithmetic, not a second claim about the geometry.
 */
export function angleFromSizeMm(sizeMm: number, distanceMeters: number): number {
  // A group has no negative size. Zero is a real one: two shots through the same hole.
  if (!Number.isFinite(sizeMm) || sizeMm < 0) return NaN;
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) return NaN;
  return Math.atan(sizeMm / (distanceMeters * 1000));
}

export interface AngularSize {
  moa: number;
  mil: number;
}

/** MOA is 1/60 of a degree; mil here is a milliradian, not the NATO mil that divides the circle into 6400. */
export function toAngularSize(sizeMm: number | null, distanceMeters: number): AngularSize | null {
  if (sizeMm === null) return null;
  const angle = angleFromSizeMm(sizeMm, distanceMeters);
  if (!Number.isFinite(angle)) return null;
  return { moa: angle / MOA_RADIANS, mil: angle / MIL_RADIANS };
}

export interface MeanPointOfImpact {
  rightMm: number;
  upMm: number;
  /** Straight-line distance from the aim point, which is what the group is off by. */
  offsetMm: number;
}

export interface GroupSummary {
  /** Impacts that could be measured. A coordinate that is not a number is left out. */
  count: number;
  /**
   * Extreme spread, measured centre to centre between the two holes that sit furthest apart. This is
   * how a group is stated in competition and in test reports (NRA and NBRSA group measurement; see
   * also Ballistipedia, "Describing Precision"). Two shots are the fewest that make a group.
   */
  extremeSpreadMm: number | null;
  /**
   * The same two holes measured outside edge to outside edge, which is centre to centre plus one
   * bullet diameter. It is what a caliper reads across the holes, so it is offered only once the
   * bullet diameter is known, and it is always the larger of the two figures.
   */
  extremeSpreadOuterMm: number | null;
  /** The pair the extreme spread was measured across, as indexes into the impacts that were passed in. */
  extremePair: readonly [number, number] | null;
  /** The mean point of impact: the arithmetic centre of the group, and the point a sight is corrected from. */
  mpi: MeanPointOfImpact | null;
  /**
   * Mean radius: the average distance from each shot to the mean point of impact (Ballistipedia,
   * "Mean Radius"). It uses every shot rather than the two worst, so it settles down sooner than the
   * extreme spread as shots are added.
   */
  meanRadiusMm: number | null;
  /**
   * Standard deviation of the impacts about the mean point of impact, along each axis. The divisor is
   * n - 1, because the centre is measured from the same shots rather than known in advance. No further
   * small-sample correction is applied, so a few shots still read low.
   */
  horizontalSdMm: number | null;
  verticalSdMm: number | null;
}

const isFinitePoint = (impact: ShotImpact) => Number.isFinite(impact.x) && Number.isFinite(impact.y);

export function summariseGroup(
  impacts: readonly ShotImpact[],
  { bulletDiameterMm = null }: { bulletDiameterMm?: number | null } = {},
): GroupSummary {
  // The indexes are kept so the drawing can point at the two holes the extreme spread was read across.
  const usable = impacts.map((impact, index) => ({ impact, index })).filter((entry) => isFinitePoint(entry.impact));
  const count = usable.length;
  if (count === 0)
    return {
      count,
      extremeSpreadMm: null,
      extremeSpreadOuterMm: null,
      extremePair: null,
      mpi: null,
      meanRadiusMm: null,
      horizontalSdMm: null,
      verticalSdMm: null,
    };

  const rightMm = usable.reduce((sum, entry) => sum + entry.impact.x, 0) / count;
  const upMm = usable.reduce((sum, entry) => sum + entry.impact.y, 0) / count;

  // Every pair is compared. A group is a handful of shots, so the plain search costs nothing and,
  // unlike a convex hull, it needs no special case for shots that fall on one line or on one spot.
  let extremeSpreadMm: number | null = null;
  let extremePair: [number, number] | null = null;
  for (const [position, first] of usable.entries())
    for (const second of usable.slice(position + 1)) {
      const spread = distanceBetween(first.impact, second.impact);
      if (extremeSpreadMm === null || spread > extremeSpreadMm) {
        extremeSpreadMm = spread;
        extremePair = [first.index, second.index];
      }
    }

  // A single shot has nothing to spread against, and its mean radius and deviation would both read as
  // zero: a precision the measurement cannot show. They stay empty until a second shot gives them meaning.
  const meanRadiusMm =
    count < 2
      ? null
      : usable.reduce((sum, { impact }) => sum + Math.hypot(impact.x - rightMm, impact.y - upMm), 0) / count;
  const deviation = (pick: (impact: ShotImpact) => number, mean: number) =>
    count < 2 ? null : Math.sqrt(usable.reduce((sum, { impact }) => sum + (pick(impact) - mean) ** 2, 0) / (count - 1));
  const usableDiameter = bulletDiameterMm !== null && Number.isFinite(bulletDiameterMm) && bulletDiameterMm > 0;

  return {
    count,
    extremeSpreadMm,
    extremeSpreadOuterMm: extremeSpreadMm !== null && usableDiameter ? extremeSpreadMm + bulletDiameterMm : null,
    extremePair,
    mpi: { rightMm, upMm, offsetMm: Math.hypot(rightMm, upMm) },
    meanRadiusMm,
    horizontalSdMm: deviation((impact) => impact.x, rightMm),
    verticalSdMm: deviation((impact) => impact.y, upMm),
  };
}

export interface AimOffset {
  vertical: { direction: VerticalImpact; valueMm: number };
  horizontal: { direction: HorizontalImpact; valueMm: number };
}

/**
 * The mean point of impact stated the way the sight adjustment tool asks for it: a side the group
 * landed on and a length that is never negative. A centred axis has no side, so the value is what
 * matters there and the direction is immaterial.
 */
export function toAimOffset(mpi: MeanPointOfImpact): AimOffset {
  return {
    vertical: { direction: mpi.upMm >= 0 ? 'high' : 'low', valueMm: Math.abs(mpi.upMm) },
    horizontal: { direction: mpi.rightMm >= 0 ? 'right' : 'left', valueMm: Math.abs(mpi.rightMm) },
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
  'distance',
  'distanceUnit',
  'bulletDiameterMm',
  'shots',
  'extremeSpreadMm',
  'extremeSpreadOuterMm',
  'extremeSpreadMoa',
  'extremeSpreadMil',
  'mpiRightMm',
  'mpiUpMm',
  'mpiOffsetMm',
  'mpiOffsetMoa',
  'meanRadiusMm',
  'horizontalSdMm',
  'verticalSdMm',
  'note',
  'impactsMm',
] as const;

export function buildRecordsCsv(records: readonly GroupRecord[]): string {
  const rows = records.map((record) => {
    const summary = summariseGroup(record.impacts, { bulletDiameterMm: record.bulletDiameterMm });
    const distanceMeters = toMeters(record.distance.value, record.distance.unit);
    const spread = toAngularSize(summary.extremeSpreadMm, distanceMeters);
    const offset = toAngularSize(summary.mpi?.offsetMm ?? null, distanceMeters);
    return [
      inert(record.name),
      record.savedAt,
      round(record.distance.value),
      record.distance.unit,
      round(record.bulletDiameterMm, 3),
      String(summary.count),
      round(summary.extremeSpreadMm),
      round(summary.extremeSpreadOuterMm),
      round(spread?.moa ?? null),
      round(spread?.mil ?? null),
      round(summary.mpi?.rightMm ?? null),
      round(summary.mpi?.upMm ?? null),
      round(summary.mpi?.offsetMm ?? null),
      round(offset?.moa ?? null),
      round(summary.meanRadiusMm),
      round(summary.horizontalSdMm),
      round(summary.verticalSdMm),
      inert(record.note),
      record.impacts.map((impact) => `${round(impact.x)},${round(impact.y)}`).join(' '),
    ].map(escapeField);
  });
  return [csvColumns.join(','), ...rows.map((row) => row.join(','))].join('\n');
}
