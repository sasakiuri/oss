/**
 * ISSF targets and how a shot on them is scored.
 *
 * Ring sizes are the outside diameters in ISSF Rule Book 2026 (Edition 2025, second print 07/2026,
 * effective 1 July 2026), rules 6.3.4.2, 6.3.4.3, 6.3.4.5 and 6.3.4.6. The annex "Rules for Paper Target
 * Scoring" (edition 2022) states that ring sizes are outside diameters (1.1.2) and that a shot touching
 * the outside edge of a higher ring scores the higher value (5.2.1). Decimal rings divide the scoring area
 * of one full ring into ten equal rings, 10.0 to 10.9 (Rule Book 6.3.3.1).
 *
 * The rules do not give the formula an electronic scoring target uses, nor the calibre it assumes. The
 * arithmetic here applies the paper rule to a round hole of the event's calibre: a shot scores ring k
 * when its centre is within the outer radius of ring k plus half the calibre, and each ring's band of
 * centre distances is cut into tenths. It is a practice score, not a gauge decision.
 *
 * The 25m precision target serves events of two calibres, so it is listed twice. The 5.6 mm events
 * (50m Pistol, 25m Standard Pistol, the precision stage of 25m Pistol) are gauged at 5.6 mm, and the
 * precision stage of 25m Centre Fire Pistol, fired with 7.62-9.65 mm (Rule Book 8.4.3.3), at 9.65 mm
 * whatever the calibre (Rules for Paper Target Scoring 1.4.1 and 1.4.3).
 */

export type IssfTargetKey = 'AR10' | 'AP10' | 'FR50' | 'P25' | 'CF25';

export interface IssfTarget {
  key: IssfTargetKey;
  name: { ja: string; en: string };
  /** Outside diameters of rings 1 to 10, in millimetres. */
  ringDiametersMm: readonly number[];
  /** The diameter the hole is scored with: the event's calibre. */
  calibreMm: number;
  /** Outside diameter of the inner ten ring, or, for the air rifle, the 10 dot that must be shot out. */
  innerTenMm: number;
  /** The air rifle's inner ten is the dot shot out completely, not a ring that is touched. */
  innerTenRule: 'touch' | 'dot-shot-out';
  /** Diameter of the black aiming area. */
  blackMm: number;
  /** The black covers these rings and up, for drawing the ring numbers in white. */
  blackFromRing: number;
  /** Whether the decimal band of the 10 ring is as wide as the other rings, so tenths are defined alike. */
  decimal: boolean;
  /** The rule the dimensions come from. */
  rule: string;
}

const rings = (ten: number, step: number) => Array.from({ length: 10 }, (_, index) => ten + (9 - index) * step);

/** The 25m precision and 50m pistol target, the same face for both of the calibres it is shot with. */
const PRECISION_PISTOL = {
  ringDiametersMm: rings(50, 50),
  innerTenMm: 25,
  innerTenRule: 'touch',
  blackMm: 200,
  blackFromRing: 7,
  // Its 10 ring is wider than the others, so tenths would not be equal bands. Integer only.
  decimal: false,
  rule: '6.3.4.5',
} as const;

export const issfTargets: readonly IssfTarget[] = [
  {
    key: 'AR10',
    name: { ja: '10m エアライフル', en: '10m Air Rifle' },
    ringDiametersMm: rings(0.5, 5),
    calibreMm: 4.5,
    innerTenMm: 0.5,
    innerTenRule: 'dot-shot-out',
    blackMm: 30.5,
    blackFromRing: 4,
    decimal: true,
    rule: '6.3.4.3',
  },
  {
    key: 'AP10',
    name: { ja: '10m エアピストル', en: '10m Air Pistol' },
    ringDiametersMm: rings(11.5, 16),
    calibreMm: 4.5,
    innerTenMm: 5,
    innerTenRule: 'touch',
    blackMm: 59.5,
    blackFromRing: 7,
    decimal: true,
    rule: '6.3.4.6',
  },
  {
    key: 'FR50',
    name: { ja: '50m ライフル', en: '50m Rifle' },
    ringDiametersMm: rings(10.4, 16),
    calibreMm: 5.6,
    innerTenMm: 5,
    innerTenRule: 'touch',
    blackMm: 112.4,
    blackFromRing: 3,
    decimal: true,
    rule: '6.3.4.2',
  },
  {
    key: 'P25',
    name: { ja: '25m 精密・50m ピストル（5.6 mm）', en: '25m Precision / 50m Pistol (5.6 mm)' },
    ...PRECISION_PISTOL,
    calibreMm: 5.6,
  },
  {
    key: 'CF25',
    name: { ja: '25m センターファイア 精密（9.65 mm）', en: '25m Centre Fire Precision (9.65 mm)' },
    ...PRECISION_PISTOL,
    calibreMm: 9.65,
  },
];

export function issfTarget(key: IssfTargetKey): IssfTarget {
  const target = issfTargets.find((candidate) => candidate.key === key);
  if (!target) throw new Error(`Unknown ISSF target: ${key}`);
  return target;
}

export interface ShotScore {
  /** Whole ring, 0 for a miss. */
  ring: number;
  /** Tenths, 0.0 for a miss and at most 10.9. Null where the target is scored in whole rings only. */
  decimal: number | null;
  innerTen: boolean;
}

/** Outer radius of ring k (1 to 10). */
const ringRadius = (target: IssfTarget, ring: number) => (target.ringDiametersMm[ring - 1] as number) / 2;

/** A tolerance for the float arithmetic, far below anything a photo or a tap can place. */
const EPSILON = 1e-9;

export function scoreShot(target: IssfTarget, distanceMm: number): ShotScore | null {
  if (!Number.isFinite(distanceMm) || distanceMm < 0) return null;
  const half = target.calibreMm / 2;
  let ring = 0;
  for (let candidate = 10; candidate >= 1; candidate--)
    if (distanceMm - half <= ringRadius(target, candidate) + EPSILON) {
      ring = candidate;
      break;
    }
  const innerTen =
    ring === 10 &&
    (target.innerTenRule === 'dot-shot-out'
      ? distanceMm + target.innerTenMm / 2 <= half + EPSILON
      : distanceMm - half <= target.innerTenMm / 2 + EPSILON);
  if (!target.decimal) return { ring, decimal: null, innerTen };
  if (ring === 0) return { ring, decimal: 0, innerTen };
  const width = ringRadius(target, 1) - ringRadius(target, 2);
  const raw = 1 + (ringRadius(target, 1) + half - distanceMm) / width;
  const tenths = Math.min(109, Math.floor(raw * 10 + EPSILON));
  return { ring, decimal: tenths / 10, innerTen };
}

export interface ScoredShot {
  x: number;
  y: number;
  sighter: boolean;
}

export interface SeriesSummary {
  /** Match shots only, in the order fired. */
  shots: number;
  total: number;
  innerTens: number;
}

export interface CardSummary {
  series: SeriesSummary[];
  shots: number;
  total: number;
  /** Total divided by match shots, or null before the first. */
  average: number | null;
  innerTens: number;
  sighters: number;
}

/**
 * Results are totalled in series of ten, the series ties are broken on (Rule Book 6.15.1 b). The
 * 25m events are fired in series of five (8.7.6.4, 8.7.6.5), two of which make one of these.
 */
export const SERIES_LENGTH = 10;

/**
 * Totals of the match shots in series of ten. Decimal totals are summed in tenths, so ten shots of
 * 10.3 make 103.0 rather than 102.99999.
 */
export function summariseCard(target: IssfTarget, shots: readonly ScoredShot[], decimal: boolean): CardSummary {
  const useDecimal = decimal && target.decimal;
  const match = shots.filter((shot) => !shot.sighter);
  const values = match.map((shot) => scoreShot(target, Math.hypot(shot.x, shot.y)));
  const units = values.map((score) =>
    score === null ? 0 : useDecimal ? Math.round((score.decimal ?? 0) * 10) : score.ring * 10,
  );
  const series: SeriesSummary[] = [];
  for (let start = 0; start < units.length; start += SERIES_LENGTH) {
    const slice = units.slice(start, start + SERIES_LENGTH);
    series.push({
      shots: slice.length,
      total: slice.reduce((sum, value) => sum + value, 0) / 10,
      innerTens: values.slice(start, start + SERIES_LENGTH).filter((score) => score?.innerTen).length,
    });
  }
  const totalTenths = units.reduce((sum, value) => sum + value, 0);
  return {
    series,
    shots: match.length,
    total: totalTenths / 10,
    average: match.length === 0 ? null : totalTenths / 10 / match.length,
    innerTens: values.filter((score) => score?.innerTen).length,
    sighters: shots.length - match.length,
  };
}
