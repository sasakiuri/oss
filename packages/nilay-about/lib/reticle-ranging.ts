import type { FocalPlane, ReticleUnit, SolveFor, TargetSizeUnit } from './schemas/reticle-ranging';
import type { DistanceUnit } from './schemas/sight-adjustment';
import { MIL_RADIANS, MM_PER_INCH, MOA_RADIANS, fromMeters, toMeters } from './sight-adjustment';

export type { DistanceUnit } from './schemas/sight-adjustment';

export type {
  FocalPlane,
  ReticleRangingSettings,
  ReticleUnit,
  SolveFor,
  TargetSizeUnit,
} from './schemas/reticle-ranging';

/**
 * Stadiametric ranging, for a target held on the optical axis.
 *
 * The target is centred in the field of view and the graduations are read from one edge of it to the other,
 * so the angle straddles the axis and each half of the target is a right triangle of its own:
 *
 *   target size = 2 × distance × tan(angle / 2)
 *   distance    = target size / (2 × tan(angle / 2))
 *   angle       = 2 × atan(target size / (2 × distance))
 *
 * This is deliberately not `angularSizeMm` from `lib/sight-adjustment.ts`. That function answers a different
 * question — how far one edge lies off the axis, which is what turning a turret moves a group — and it is
 * correct for that. Borrowing it here would treat the whole target as sitting to one side of the axis and
 * would read about 0.25 % short at 100 mil. The angular units are still the ones that file defines: 1 MOA is
 * 1/60 of a degree and one mil is a milliradian (1/1000 radian), not the NATO mil that divides the circle
 * into 6400 parts.
 *
 * Reading a target well away from the centre of the field breaks that assumption, and the true answer then
 * falls somewhere between this model and the one-sided one.
 *
 * Shooting literature states the relation as "distance in metres = target height in millimetres divided by
 * the mil reading", which is what is left once tan(x) is replaced by x. The shortcut reads long by about
 * x²/12 in relative terms: 0.0000083 % at 1 mil, 0.00083 % at 10 mil and 0.083 % at 100 mil. Ranging a 1 m
 * target that reads 10 mil, that is less than a millimetre out of 100 m, while misreading the same target by
 * a tenth of a mil moves the estimate by about 1 m. The approximation is therefore harmless in the field;
 * tan is kept anyway so that the three directions are exact inverses of each other and a value put through
 * all three comes back unchanged.
 */

const RETICLE_UNIT_RADIANS: Record<ReticleUnit, number> = { mil: MIL_RADIANS, moa: MOA_RADIANS };

const SIZE_UNIT_MM: Record<TargetSizeUnit, number> = { cm: 10, m: 1000, inch: MM_PER_INCH };

/** Reticles are read to a tenth of a graduation, so that is the misreading the sensitivity allows for. */
export const READING_STEP = 0.1;

/** A target size taken from memory or from a reference book is easily this far out. */
export const SIZE_UNCERTAINTY_SHARE = 0.1;

/**
 * Half of this is a right angle, where the edge of a centred target runs parallel to the line of sight and
 * is no longer anywhere. Past it the half-angle tangent changes sign and the arithmetic stops meaning
 * anything, so every angle the tool works with has to stay below it.
 */
export const MAX_ANGLE_RADIANS = Math.PI;

export function toSizeMm(value: number, unit: TargetSizeUnit): number {
  return value * SIZE_UNIT_MM[unit];
}

export function fromSizeMm(millimeters: number, unit: TargetSizeUnit): number {
  return millimeters / SIZE_UNIT_MM[unit];
}

/**
 * How much true angle one graduation of the reticle covers, relative to its printed value.
 *
 * A first focal plane reticle sits in front of the zoom, so it grows and shrinks with the image and its
 * graduations stay true at every magnification. A second focal plane reticle sits behind the zoom and keeps
 * a fixed angular size at the eyepiece while the image scales, so its graduations are only true at the one
 * magnification the maker published them for. Halving the magnification from that point halves the image
 * against an unchanged reticle, so a target that covered two graduations now covers one: the reading has to
 * be multiplied by calibration ÷ used to recover the true angle.
 */
export function reticleScale(focalPlane: FocalPlane, magnification: { calibration: number; used: number }): number {
  if (focalPlane === 'ffp') return 1;
  const { calibration, used } = magnification;
  if (!Number.isFinite(calibration) || calibration <= 0 || !Number.isFinite(used) || used <= 0) return NaN;
  return calibration / used;
}

/** Graduations read off the reticle → the true angle they subtend, in radians. */
export function readingToRadians(reading: number, unit: ReticleUnit, scale: number): number {
  return reading * scale * RETICLE_UNIT_RADIANS[unit];
}

/** The inverse: a true angle → the graduations it covers at the magnification in use. */
export function radiansToReading(radians: number, unit: ReticleUnit, scale: number): number {
  return radians / (scale * RETICLE_UNIT_RADIANS[unit]);
}

/** The size, in millimetres, of a centred target that spans `angleRadians` at `distanceMeters`. */
export function sizeForAngle(angleRadians: number, distanceMeters: number): number {
  return 2 * distanceMeters * Math.tan(angleRadians / 2) * 1000;
}

/** The distance at which a centred target of `sizeMm` spans `angleRadians`. */
export function distanceForAngle(sizeMm: number, angleRadians: number): number {
  return sizeMm / 1000 / (2 * Math.tan(angleRadians / 2));
}

/** The angle a centred target of `sizeMm` spans at `distanceMeters`. */
export function angleForSize(sizeMm: number, distanceMeters: number): number {
  return 2 * Math.atan(sizeMm / 1000 / (2 * distanceMeters));
}

export interface ReadingSensitivity {
  /** The misreading allowed for, in the reticle unit in use. */
  step: number;
  /** Estimate when the target is read this much larger, or null once that angle leaves the workable range. */
  nearMeters: number | null;
  /** Estimate for this many fewer graduations, or null once the reading reaches zero and the distance runs away. */
  farMeters: number | null;
  /** The larger of the two shifts as a share of the estimate, or null while either side is missing. */
  worstShare: number | null;
}

export interface SizeUncertainty {
  /** The share the target size is assumed to be out by. */
  share: number;
  lowMeters: number;
  highMeters: number;
}

export interface ReticleRangingInput {
  solveFor: SolveFor;
  targetSize: { value: number; unit: TargetSizeUnit };
  apparent: { value: number; unit: ReticleUnit };
  distance: { value: number; unit: DistanceUnit };
  focalPlane: FocalPlane;
  magnification: { calibration: number; used: number };
}

export interface ReticleRangingResult {
  solveFor: SolveFor;
  distanceMeters: number;
  distanceYards: number;
  sizeMm: number;
  sizeInch: number;
  /** The true angle the target spans, with the second focal plane correction already applied. */
  angleRadians: number;
  /** What the shooter reads off the reticle at the magnification in use. */
  readingMil: number;
  readingMoa: number;
  /** The same angle as the graduations of a reticle that reads true, which differs from the above on SFP. */
  trueMil: number;
  trueMoa: number;
  /** The factor between the reading and the true angle; 1 on a first focal plane reticle. */
  scale: number;
  sensitivity: ReadingSensitivity;
  sizeUncertainty: SizeUncertainty;
}

function positive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function usableAngle(angleRadians: number): boolean {
  return positive(angleRadians) && angleRadians < MAX_ANGLE_RADIANS;
}

/**
 * The sensitivity is worked out from the finished triangle rather than from the inputs, so every direction
 * answers the same question: had this target and this reading been used to range, how far out would a
 * misreading of one tenth put the estimate? A small reading is a long shot, and a tenth is then a large
 * share of it, which is what makes ranging fall apart with distance.
 */
function readingSensitivity(
  sizeMm: number,
  reading: number,
  unit: ReticleUnit,
  scale: number,
  distanceMeters: number,
): ReadingSensitivity {
  // A step either way can leave the range the geometry covers, and a distance taken past it comes out negative.
  const shifted = (steps: number) => {
    const angle = readingToRadians(reading + steps * READING_STEP, unit, scale);
    return usableAngle(angle) ? distanceForAngle(sizeMm, angle) : null;
  };
  const near = shifted(1);
  const far = shifted(-1);
  return {
    step: READING_STEP,
    nearMeters: near,
    farMeters: far,
    worstShare:
      near === null || far === null ? null : Math.max(distanceMeters - near, far - distanceMeters) / distanceMeters,
  };
}

export function calculateReticleRanging(settings: ReticleRangingInput): ReticleRangingResult | null {
  const scale = reticleScale(settings.focalPlane, settings.magnification);
  if (!positive(scale)) return null;
  const unit = settings.apparent.unit;

  let sizeMm: number;
  let angleRadians: number;
  let distanceMeters: number;
  switch (settings.solveFor) {
    case 'distance': {
      sizeMm = toSizeMm(settings.targetSize.value, settings.targetSize.unit);
      angleRadians = readingToRadians(settings.apparent.value, unit, scale);
      if (!positive(sizeMm) || !usableAngle(angleRadians)) return null;
      distanceMeters = distanceForAngle(sizeMm, angleRadians);
      break;
    }
    case 'size': {
      distanceMeters = toMeters(settings.distance.value, settings.distance.unit);
      angleRadians = readingToRadians(settings.apparent.value, unit, scale);
      if (!positive(distanceMeters) || !usableAngle(angleRadians)) return null;
      sizeMm = sizeForAngle(angleRadians, distanceMeters);
      break;
    }
    case 'apparent': {
      distanceMeters = toMeters(settings.distance.value, settings.distance.unit);
      sizeMm = toSizeMm(settings.targetSize.value, settings.targetSize.unit);
      if (!positive(distanceMeters) || !positive(sizeMm)) return null;
      angleRadians = angleForSize(sizeMm, distanceMeters);
      break;
    }
  }

  const reading = radiansToReading(angleRadians, unit, scale);
  return {
    solveFor: settings.solveFor,
    distanceMeters,
    distanceYards: fromMeters(distanceMeters, 'yd'),
    sizeMm,
    sizeInch: sizeMm / MM_PER_INCH,
    angleRadians,
    readingMil: angleRadians / (scale * MIL_RADIANS),
    readingMoa: angleRadians / (scale * MOA_RADIANS),
    trueMil: angleRadians / MIL_RADIANS,
    trueMoa: angleRadians / MOA_RADIANS,
    scale,
    sensitivity: readingSensitivity(sizeMm, reading, unit, scale, distanceMeters),
    // Distance is exactly proportional to the target size at a fixed angle, so the error carries straight over.
    sizeUncertainty: {
      share: SIZE_UNCERTAINTY_SHARE,
      lowMeters: distanceMeters * (1 - SIZE_UNCERTAINTY_SHARE),
      highMeters: distanceMeters * (1 + SIZE_UNCERTAINTY_SHARE),
    },
  };
}
