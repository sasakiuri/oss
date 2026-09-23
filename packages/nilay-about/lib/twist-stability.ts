/**
 * Gyroscopic stability of a spin stabilised bullet, by the Miller twist rule.
 *
 * Source: Don Miller, "A New Rule for Estimating Rifling Twist: An Aid to Choosing Bullets
 * and Rifles", Precision Shooting, March 2005, 43-48, with the comparison against measured
 * data in Don Miller, "How Good Are Simple Rules For Estimating Rifling Twist", Precision
 * Shooting, June 2009, 48-52. Both were retrieved 2026-09-22 from the copies the Internet
 * Archive holds of jbmballistics.com; the equation numbers quoted below are the 2005 paper's.
 *
 * This is a semi-empirical rule, not a measurement and not a law of motion. Miller obtained
 * it by correlating moments of inertia and overturning moment coefficients for 39 projectiles
 * measured at the US Army Ballistic Research Laboratory, then folding those correlations into
 * the exact stability equation. The paper is explicit that the accurate answer needs wind
 * tunnel and range data that exists for a few dozen projectiles and not for the thousands of
 * sporting bullets, and that the rule is a guide that "gets us into the ballpark". Where the
 * trajectory tool's G1 and G7 tables are published measurements carried through unchanged,
 * the constant below is a fitted number, and it is treated as one throughout this file.
 *
 * Against 40 measured cases the 2009 paper found this rule significantly better than the
 * other simple rules it tested. Against the one detailed independent calculation the 2005
 * paper works through, it came out about 7 per cent low, which makes it the conservative
 * side to be wrong on.
 */

import type { BulletLengthUnit, MassUnit, SpeedUnit, TwistStabilitySettings } from './schemas/twist-stability';
import { MM_PER_INCH, toMillimeters } from './sight-adjustment';
import {
  GRAMS_PER_GRAIN,
  METERS_PER_FOOT,
  STANDARD_TEMPERATURE_CELSIUS,
  resolveConditions,
  toKelvin,
  toKilograms,
  toMetersPerSecond,
  type Conditions,
} from './trajectory';

export type {
  AtmosphereSetting,
  BulletLengthUnit,
  MassUnit,
  SpeedUnit,
  TwistStabilitySettings,
} from './schemas/twist-stability';

/**
 * The fitted constant of the rule, from eq (5) of the 2005 paper.
 *
 * It is dimensioned: Miller derived it with the bullet weight in grains, the diameter in
 * inches and the Army Standard Metro air density expressed as 0.304330 grains per cubic
 * inch, so it only means anything when the rule is fed those units. Restating it in SI
 * would produce a number that none of the paper's worked examples could then be checked
 * against, so the conversion happens at the edge of this file and the rule itself is
 * applied exactly as published.
 */
export const MILLER_CONSTANT = 30.0;

/**
 * The conditions the constant was fitted at: Army Standard Metro, which is 59 °F, 750 mm of
 * mercury and 78 % humidity, and a velocity of 2800 ft/s (Mach 2.5).
 *
 * This is not the ISO 2533 reference atmosphere the trajectory tool works against. They
 * share a temperature - 59 °F is exactly 15 °C - but not a pressure: 750 mmHg is 999.9 hPa
 * against 1013.25 hPa. A calculator that states the correction against 29.92 inHg is using
 * the ISO figure instead, and reads about 1.3 % higher than this one for the same bullet.
 */
export const REFERENCE_VELOCITY_FPS = 2800;
/** Conventional millimetre of mercury: 133.322387415 Pa, as defined in NIST Special Publication 811. */
export const PASCALS_PER_MM_OF_MERCURY = 133.322387415;
export const ARMY_STANDARD_METRO_PRESSURE_PA = 750 * PASCALS_PER_MM_OF_MERCURY;
/** 59 °F stated as 15 °C, read into kelvin by the same conversion the other tools use. */
export const ARMY_STANDARD_METRO_TEMPERATURE_K = toKelvin(STANDARD_TEMPERATURE_CELSIUS, 'c');

/**
 * The velocity the correction is held at below: the paper's speed of sound, 1120 ft/s.
 *
 * The overturning moment is the only velocity dependent term in the stability equation, and
 * the correction that stands in for it was fitted to supersonic data. Rather than run it on
 * down to zero, the paper holds it at Mach 1. An air rifle sits well inside that floor, so
 * every airgun pellet is read at the same factor.
 */
export const VELOCITY_FLOOR_FPS = 1120;

/**
 * Where the published recommendations fall.
 *
 * Below 1.0 the bullet is unstable: that is the rule's own criterion and not a matter of
 * taste. Between 1.0 and 1.5 it is above that line but below what the 2009 paper calls
 * suitable for most applications, with 1.3 the lowest figure it reports anyone choosing
 * on purpose, and benchrest shooters at that. From 1.5 up it is inside the military's
 * usual 1.5 to 2.5, and 2.0 is the figure the same paper gives for keeping the margin in
 * cold weather.
 */
export const MARGINAL_STABILITY = 1.0;
export const ADEQUATE_STABILITY = 1.5;
/** The lowest stability factor the 2009 paper reports being chosen deliberately, by benchrest shooters. */
export const BENCHREST_STABILITY = 1.3;
/** The 2009 paper's figure for keeping the margin through cold weather. */
export const COLD_WEATHER_STABILITY = 2.0;

export type StabilityBand = 'unstable' | 'marginal' | 'adequate';

export function stabilityBand(stability: number): StabilityBand {
  if (stability < MARGINAL_STABILITY) return 'unstable';
  return stability < ADEQUATE_STABILITY ? 'marginal' : 'adequate';
}

/** A bullet's own measurements in millimetres. Both units are offset units, so the shared conversion takes them. */
export function bulletToMillimeters(value: number, unit: BulletLengthUnit): number {
  return toMillimeters(value, unit);
}

/**
 * The way back. The matching inverse lives in the shot group module, which measures photographs
 * and which this page has no other reason to load, so the one line is written out against the
 * same shared inch rather than reaching for it.
 */
export function bulletFromMillimeters(millimetres: number, unit: BulletLengthUnit): number {
  return unit === 'inch' ? millimetres / MM_PER_INCH : millimetres;
}

export function massFromKilograms(kilograms: number, unit: MassUnit): number {
  return unit === 'grain' ? (kilograms * 1000) / GRAMS_PER_GRAIN : kilograms * 1000;
}

/**
 * Decimals kept when a field is rewritten into another unit.
 *
 * A hundredth of a millimetre and a thousandth of an inch are both finer than a caliper
 * reads a bullet; a hundredth of a grain is 0.65 mg. Fine enough that the rewritten number
 * stands for the same bullet, coarse enough to stay readable, which means a unit changed
 * and changed back can move the last digit by half a step of the unit it passed through.
 */
const LENGTH_DECIMALS: Record<BulletLengthUnit, number> = { mm: 2, inch: 4 };
const MASS_DECIMALS: Record<MassUnit, number> = { g: 3, grain: 2 };
const SPEED_DECIMALS: Record<SpeedUnit, number> = { mps: 1, fps: 1 };

function round(value: number, decimals: number): number {
  // A draft the reader is still typing can be NaN, and it has to survive a unit change as a draft.
  if (!Number.isFinite(value)) return value;
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
}

export function convertBulletLength(value: number, from: BulletLengthUnit, to: BulletLengthUnit): number {
  return from === to ? value : round(bulletFromMillimeters(bulletToMillimeters(value, from), to), LENGTH_DECIMALS[to]);
}

export function convertMass(value: number, from: MassUnit, to: MassUnit): number {
  return from === to ? value : round(massFromKilograms(toKilograms(value, from), to), MASS_DECIMALS[to]);
}

export function convertSpeed(value: number, from: SpeedUnit, to: SpeedUnit): number {
  if (from === to) return value;
  const metersPerSecond = toMetersPerSecond(value, from);
  return round(to === 'fps' ? metersPerSecond / METERS_PER_FOOT : metersPerSecond, SPEED_DECIMALS[to]);
}

/**
 * Velocity correction, eq (E) of the 2005 paper: fv = (v/2800)^(1/3), multiplying the
 * stability factor. The paper calls it a VERY crude approximation in those capitals, and
 * it is: it stands in for the whole velocity dependence of the overturning moment. Its
 * saving grace is how little it moves - a bullet driven from 2800 to 3350 ft/s gains six
 * per cent of stability - which is itself the paper's point that velocity is not the lever
 * a shooter reaches for.
 */
export function velocityFactor(speedFps: number): number {
  if (!Number.isFinite(speedFps) || speedFps <= 0) return NaN;
  return (Math.max(speedFps, VELOCITY_FLOOR_FPS) / REFERENCE_VELOCITY_FPS) ** (1 / 3);
}

/**
 * Air density correction, eq (H) of the 2005 paper, multiplying the stability factor.
 *
 * The paper writes it as the ratio of the standard air density to the day's, worked out
 * from the perfect gas law: (°F + 460)/519 × P_std/P, or equally (°C + 273)/288 × P_std/P.
 * Here the absolute temperatures are the exact ones the rest of the tools carry rather than
 * the paper's rounded 460 and 273, which moves the factor by under 0.02 % and leaves its
 * worked examples reproducible either way.
 *
 * Two things this does not carry. The Army Standard Metro density the constant was fitted
 * to includes 78 % humidity, while a perfect gas ratio like this one knows only temperature
 * and pressure, so the factor is exactly 1 at the reference conditions by construction
 * rather than by measurement; damp air is a few tenths of a per cent lighter than the dry
 * air this assumes. And the paper's separate altitude correction, eq (I), is not implemented:
 * the atmosphere card already puts the standard sea level pressure at a height through the
 * ISO 2533 barometric formula, which is the same idea carried out more exactly.
 */
export function atmosphereFactor(conditions: Conditions): number {
  const { temperatureK, pressurePa } = conditions;
  if (!Number.isFinite(temperatureK) || temperatureK <= 0) return NaN;
  if (!Number.isFinite(pressurePa) || pressurePa <= 0) return NaN;
  return (temperatureK / ARMY_STANDARD_METRO_TEMPERATURE_K) * (ARMY_STANDARD_METRO_PRESSURE_PA / pressurePa);
}

/**
 * The rule itself, eq (B) of the 2005 paper, at its reference velocity and atmosphere.
 *
 *   s = 30 m / (t² d³ l (1 + l²))
 *
 * with the weight m in grains, the diameter d in inches, the twist t in calibers per turn
 * and the length l in calibers. Substituting t = T/d and l = L/d, where T is the twist and
 * L the length in inches, collapses it to the form below, which is how the 2009 paper's
 * eq (1) prints the same rule:
 *
 *   s = 30 m d² / (T² L (d² + L²))
 *
 * The bullet's density never appears. Miller notes that it is already inside the weight,
 * through the moment of inertia correlation the rule is built on, so the rule covers cast
 * lead, jacketed, bronze and other solid core bullets without modification. He checked that
 * on an aluminium alloy projectile of density 2.8 against the 10.9 of a jacketed bullet and
 * came within 2 per cent. That is what makes this rule worth having for a copper bullet: a
 * copper bullet is longer than a lead one of the same weight, and the length is exactly
 * what the rule is most sensitive to.
 */
export function stabilityFactor(
  massGrains: number,
  diameterInch: number,
  lengthInch: number,
  twistInch: number,
): number {
  const denominator = twistInch ** 2 * lengthInch * (diameterInch ** 2 + lengthInch ** 2);
  if (!Number.isFinite(denominator) || denominator <= 0) return NaN;
  return (MILLER_CONSTANT * massGrains * diameterInch ** 2) / denominator;
}

/**
 * The twist that reaches a wanted stability factor, eq (C) of the 2005 paper.
 *
 * Stability goes with the inverse square of the twist, so the twist is the square root of
 * the rearranged rule. The velocity and atmosphere corrections multiply the square of the
 * twist exactly as they multiply the stability factor, which is why the paper's eq (G)
 * carries their square root into the twist.
 */
export function requiredTwistInch(
  massGrains: number,
  diameterInch: number,
  lengthInch: number,
  targetStability: number,
  correction: number,
): number {
  const denominator = targetStability * lengthInch * (diameterInch ** 2 + lengthInch ** 2);
  if (!Number.isFinite(denominator) || denominator <= 0) return NaN;
  return Math.sqrt((MILLER_CONSTANT * massGrains * diameterInch ** 2 * correction) / denominator);
}

/**
 * The longest bullet of this weight that the barrel still holds at the wanted stability.
 *
 * Holding the weight and changing only the length is not an idle question: it is the
 * question a copper bullet asks. Solving the rule for L leaves a depressed cubic,
 *
 *   L³ + d² L - K = 0,   K = 30 m d² × corrections / (T² s)
 *
 * whose coefficients are all positive, so the left side rises monotonically through zero
 * exactly once and Cardano's formula returns that single real root without a case to pick
 * between. The root is fed back through the rule in the tests rather than trusted.
 */
export function maxLengthInch(
  massGrains: number,
  diameterInch: number,
  twistInch: number,
  targetStability: number,
  correction: number,
): number {
  const denominator = twistInch ** 2 * targetStability;
  if (!Number.isFinite(denominator) || denominator <= 0) return NaN;
  const k = (MILLER_CONSTANT * massGrains * diameterInch ** 2 * correction) / denominator;
  if (!Number.isFinite(k) || k <= 0) return NaN;
  const halfK = k / 2;
  const discriminant = Math.sqrt(halfK ** 2 + diameterInch ** 6 / 27);
  return Math.cbrt(halfK + discriminant) + Math.cbrt(halfK - discriminant);
}

export type TwistCautionKey = 'diameter' | 'mass' | 'twist' | 'velocity' | 'lengthCalibers' | 'density';

/**
 * The band each quantity stays inside before the tool stops calling the entry a bullet in a
 * barrel. Like the recoil tool's ranges these are editorial rather than anything the rule
 * enforces: the arithmetic holds for any positive number, so a value outside the band is
 * still calculated and only carries a caution. The room is deliberately wide, from an air
 * rifle pellet to a large bore rifle.
 *
 * The last two are not bands on a field but on what the fields say together. A bullet ten
 * calibers long is outside anything the rule was fitted against, and a bullet that would
 * have to be denser than solid lead to weigh what was typed is a slipped unit rather than a
 * bullet - the commonest slip there is, a length read in millimetres and entered as inches.
 */
export const PLAUSIBLE_RANGES: Record<Exclude<TwistCautionKey, 'density'>, { min: number; max: number }> = {
  /** Millimetres: a 4.5 mm air rifle pellet at one end, a large bore rifle at the other. */
  diameter: { min: 3, max: 30 },
  /** Kilograms: a light airgun pellet to a heavy large bore bullet. */
  mass: { min: 0.00003, max: 0.2 },
  /** Millimetres of barrel per turn: far tighter and far slower than any rifling in use. */
  twist: { min: 25, max: 5000 },
  /** Metres per second, the same band the recoil tool calls a firearm. */
  velocity: { min: 50, max: 1500 },
  /** Calibers: a round ball is 1, the longest bullets are about 5.5. */
  lengthCalibers: { min: 0.5, max: 10 },
};

/**
 * Density of lead at room temperature, 11.34 g/cm³.
 *
 * A bullet is never a solid cylinder - it has an ogive, often a hollow point or a boat tail -
 * so the density worked out from its bounding cylinder always reads below the density of what
 * it is made of. Reading above solid lead therefore means the numbers cannot describe one
 * object, whatever it is made of.
 */
export const LEAD_DENSITY_G_PER_CM3 = 11.34;

export interface TwistCaution {
  key: TwistCautionKey;
  bound: 'below' | 'above';
  /** The bound that was crossed, in the unit the range above is stated in, so the screen can convert it. */
  limit: number;
}

export interface TwistStabilityResult {
  diameterMm: number;
  lengthMm: number;
  massKg: number;
  twistMm: number;
  muzzleSpeedMs: number;
  conditions: Conditions;
  /** Length in calibers: the rule's own measure of a bullet, and what it is most sensitive to. */
  lengthCalibers: number;
  /** Weight over the volume of the cylinder the bullet would fill, in g/cm³. Always below the material. */
  cylinderDensity: number;
  /** The rule at its reference velocity and atmosphere, before either correction. */
  standardStability: number;
  velocityFactor: number;
  atmosphereFactor: number;
  /** True once the muzzle velocity is below the floor the velocity correction is held at. */
  velocityFloorApplied: boolean;
  stability: number;
  band: StabilityBand;
  /** Twist for the wanted stability factor, at this velocity and in this air. */
  requiredTwistMm: number;
  /** Longest bullet of this weight this barrel holds at the wanted stability, same conditions. */
  maxLengthMm: number;
  cautions: TwistCaution[];
}

function collectCautions(values: Record<Exclude<TwistCautionKey, 'density'>, number>, density: number): TwistCaution[] {
  const banded = (Object.keys(PLAUSIBLE_RANGES) as Exclude<TwistCautionKey, 'density'>[]).flatMap(
    (key): TwistCaution[] => {
      const { min, max } = PLAUSIBLE_RANGES[key];
      if (values[key] < min) return [{ key, bound: 'below', limit: min }];
      if (values[key] > max) return [{ key, bound: 'above', limit: max }];
      return [];
    },
  );
  const tooDense = Number.isFinite(density) && density > LEAD_DENSITY_G_PER_CM3;
  return tooDense ? [...banded, { key: 'density', bound: 'above', limit: LEAD_DENSITY_G_PER_CM3 }] : banded;
}

/**
 * The whole calculation, from the fields as they are typed.
 *
 * Every conversion happens here, at the edge: the rule runs in grains and inches because
 * its constant was fitted in grains and inches, and everything the screen needs comes back
 * in millimetres, kilograms and metres per second.
 */
export function calculateTwistStability(settings: TwistStabilitySettings): TwistStabilityResult | null {
  const diameterMm = bulletToMillimeters(settings.diameter, settings.bulletUnit);
  const lengthMm = bulletToMillimeters(settings.length, settings.bulletUnit);
  const twistMm = bulletToMillimeters(settings.twist, settings.twistUnit);
  const massKg = toKilograms(settings.mass, settings.massUnit);
  const muzzleSpeedMs = toMetersPerSecond(settings.muzzleSpeed, settings.speedUnit);
  const positive = (value: number) => Number.isFinite(value) && value > 0;
  if (![diameterMm, lengthMm, twistMm, massKg, muzzleSpeedMs].every(positive)) return null;
  if (!positive(settings.targetStability)) return null;

  const conditions = resolveConditions(settings.atmosphere);
  if (conditions === null) return null;

  const diameterInch = diameterMm / MM_PER_INCH;
  const lengthInch = lengthMm / MM_PER_INCH;
  const twistInch = twistMm / MM_PER_INCH;
  const massGrains = massFromKilograms(massKg, 'grain');
  const speedFps = muzzleSpeedMs / METERS_PER_FOOT;

  const standardStability = stabilityFactor(massGrains, diameterInch, lengthInch, twistInch);
  const velocity = velocityFactor(speedFps);
  const atmosphere = atmosphereFactor(conditions);
  const correction = velocity * atmosphere;
  const stability = standardStability * correction;
  if (!Number.isFinite(stability)) return null;

  // The cylinder the bullet would fill, as a density the reader can compare with a metal.
  const radiusCm = diameterMm / 20;
  const cylinderDensity = (massKg * 1000) / (Math.PI * radiusCm ** 2 * (lengthMm / 10));

  return {
    diameterMm,
    lengthMm,
    massKg,
    twistMm,
    muzzleSpeedMs,
    conditions,
    lengthCalibers: lengthMm / diameterMm,
    cylinderDensity,
    standardStability,
    velocityFactor: velocity,
    atmosphereFactor: atmosphere,
    velocityFloorApplied: speedFps < VELOCITY_FLOOR_FPS,
    stability,
    band: stabilityBand(stability),
    requiredTwistMm:
      requiredTwistInch(massGrains, diameterInch, lengthInch, settings.targetStability, correction) * MM_PER_INCH,
    maxLengthMm: maxLengthInch(massGrains, diameterInch, twistInch, settings.targetStability, correction) * MM_PER_INCH,
    cautions: collectCautions(
      {
        diameter: diameterMm,
        mass: massKg,
        twist: twistMm,
        velocity: muzzleSpeedMs,
        lengthCalibers: lengthMm / diameterMm,
      },
      cylinderDensity,
    ),
  };
}
