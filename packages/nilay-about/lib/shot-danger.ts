/**
 * Drawing the cone surface danger zone of the US Army range safety pamphlet (DA PAM 385-63,
 * 16 April 2014, figure 4-1: small arms direct fire without exploding projectiles) on the ground,
 * from a firing point, a bearing and a row of the pamphlet's tables.
 *
 * - The dispersion area is 5° either side of the line of fire. Paragraph 4-1 d allows 2° only for
 *   static training on small arms ranges whose reduction an approving authority has signed off in
 *   the unit's risk assessment, so it is not offered here.
 * - The ricochet area is the next 5° on each side.
 * - Area A is the row's buffer outside the ricochet area, opening at 30° from the line of fire at
 *   the firing point and running parallel to the ricochet area's edge.
 * - All of it runs out to the row's Distance X.
 *
 * Both lengths come from the same row of the tables and nothing else: the figure is only the
 * pamphlet's zone when the figure and the numbers are the pamphlet's. Rows the pamphlet sends to
 * another figure (12-gauge 7½, 8 and 9 shot: figure 4-8, a trap range's shotfall) draw nothing.
 *
 * It is a design standard for military training ranges on the pamphlet's assumptions, not a
 * Japanese rule and not a line beyond which a shot is safe. The pamphlet applies the cone to static,
 * known distance ranges (paragraph 4-1 b); its batwing (figures 4-3 and 4-4), which contains more of
 * the ricochets, is not drawn. Terrain, slopes, water and hard ground are not modelled.
 */

import { arcPoints, directGeodesic, type GeoPoint } from './geodesy';

export const DANGER_SOURCE_CHECKED_ON = '2026-09-25';
export const DISPERSION_DEGREES = 5;
export const RICOCHET_DEGREES = 5;
export const AREA_A_OPENING_DEGREES = 30;

/** Rows of DA PAM 385-63 tables 4-1 and 4-3 (earth or water impact) and the figure each is drawn with. */
export const pamphletRows = [
  {
    id: '12-gauge-slug',
    table: '4-1',
    figure: '4-1',
    distanceXMetres: 1073,
    areaAMetres: 100,
    label: {
      ja: '12 番 スラッグ・バックショット等（7½ 号より大きい散弾）',
      en: '12-gauge slug, buckshot and shot larger than 7½',
    },
  },
  {
    id: '22-lr',
    table: '4-3',
    figure: '4-1',
    distanceXMetres: 1400,
    areaAMetres: 100,
    label: { ja: '.22 LR（ボール弾）', en: '.22 LR ball' },
  },
  {
    id: '12-gauge-shot',
    table: '4-1',
    figure: '4-8',
    distanceXMetres: 275,
    areaAMetres: null,
    label: { ja: '12 番 7½・8・9 号', en: '12-gauge 7½, 8 and 9 shot' },
  },
] as const;

export type PamphletRowId = (typeof pamphletRows)[number]['id'];
/** The rows drawn with figure 4-1. */
export type ConeRow = Extract<(typeof pamphletRows)[number], { figure: '4-1' }>;
export type ConeRowId = ConeRow['id'];

export const coneRow = (id: ConeRowId): ConeRow =>
  pamphletRows.find((row): row is ConeRow => row.id === id && row.figure === '4-1')!;

export interface DangerZone {
  distanceXMetres: number;
  areaAMetres: number;
  /** The line of fire from the firing point out to Distance X. */
  lineOfFire: GeoPoint[];
  dispersion: GeoPoint[];
  ricochet: { left: GeoPoint[]; right: GeoPoint[] };
  areaA: { left: GeoPoint[]; right: GeoPoint[] };
  /** Angle either side of the line of fire that the whole zone takes up at Distance X. */
  outerHalfAngleDegrees: number;
}

const degrees = Math.PI / 180;

/** A point given by distance and angle from the line of fire (positive to the right). */
const polar = (firing: GeoPoint, bearing: number, angle: number, distance: number) =>
  directGeodesic(firing, bearing + angle, distance);

/**
 * The zone for a firing point, a bearing in degrees from true north and a row of the tables.
 * Returns null for a row that figure 4-1 does not apply to, or a bearing that is not a number.
 */
export function coneDangerZone(firing: GeoPoint, bearing: number, rowId: PamphletRowId): DangerZone | null {
  const row = pamphletRows.find((candidate) => candidate.id === rowId);
  if (!row || row.figure !== '4-1' || !Number.isFinite(bearing)) return null;
  const { distanceXMetres: distanceX, areaAMetres: areaAWidth } = row;
  const edge = DISPERSION_DEGREES + RICOCHET_DEGREES;
  const opening = AREA_A_OPENING_DEGREES;
  const sector = (from: number, to: number) => [
    { ...firing },
    ...arcPoints(firing, bearing + from, bearing + to, distanceX, 1),
  ];
  // Where the 30° ray has drawn the buffer's width clear of the ricochet edge: 292 m for 100 m,
  // well inside every row's Distance X.
  const reach = areaAWidth / Math.sin((opening - edge) * degrees);
  // The far end of the parallel run, where it meets Distance X.
  const farAngle = edge + Math.atan2(areaAWidth, Math.sqrt(distanceX ** 2 - areaAWidth ** 2)) / degrees;

  /** Area A on one side: `sign` is +1 for the right, -1 for the left. */
  const areaA = (sign: 1 | -1): GeoPoint[] => {
    const corner = polar(firing, bearing, sign * opening, reach);
    const far = polar(firing, bearing, sign * farAngle, distanceX);
    // The arc at Distance X from the outer edge back to the ricochet edge, clockwise either way.
    const arc =
      sign > 0
        ? arcPoints(firing, bearing + edge, bearing + farAngle, distanceX, 1).reverse()
        : arcPoints(firing, bearing - farAngle, bearing - edge, distanceX, 1);
    return [{ ...firing }, corner, far, ...arc.slice(1)];
  };

  return {
    distanceXMetres: distanceX,
    areaAMetres: areaAWidth,
    lineOfFire: [{ ...firing }, directGeodesic(firing, bearing, distanceX)],
    dispersion: sector(-DISPERSION_DEGREES, DISPERSION_DEGREES),
    ricochet: { left: sector(-edge, -DISPERSION_DEGREES), right: sector(DISPERSION_DEGREES, edge) },
    areaA: { left: areaA(-1), right: areaA(1) },
    outerHalfAngleDegrees: farAngle,
  };
}
