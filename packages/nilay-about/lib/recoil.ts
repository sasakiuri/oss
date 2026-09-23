import type { ChargeMassUnit, FirearmType, GunMassUnit, RecoilLoad, VelocityUnit } from './schemas/recoil';
import { MM_PER_INCH } from './sight-adjustment';

export type {
  ChargeMassUnit,
  FirearmType,
  GunMassUnit,
  LoadId,
  RecoilLoad,
  RecoilSettings,
  VelocityUnit,
} from './schemas/recoil';

/** The international avoirdupois pound, 0.45359237 kg exactly (agreement of 1959; NIST SP 811). */
export const KILOGRAMS_PER_POUND = 0.45359237;
/** The grain is defined as 1/7000 of the avoirdupois pound, which makes it 64.79891 mg exactly. */
export const GRAINS_PER_POUND = 7000;
export const KILOGRAMS_PER_GRAIN = KILOGRAMS_PER_POUND / GRAINS_PER_POUND;
/** One foot is twelve inches of 25.4 mm, so 0.3048 m exactly. Built from the sight tool's inch rather than restated. */
export const METERS_PER_FOOT = (MM_PER_INCH * 12) / 1000;
/** Standard gravity, 9.80665 m/s² exactly (3rd CGPM, 1901). Used only to turn pounds-force into newtons. */
export const STANDARD_GRAVITY = 9.80665;
/** One foot-pound is one foot times one pound-force: 0.3048 m × (0.45359237 kg × 9.80665 m/s²) = 1.3558… J. */
export const JOULES_PER_FOOT_POUND = METERS_PER_FOOT * KILOGRAMS_PER_POUND * STANDARD_GRAVITY;

/**
 * Effective propellant gas velocity, as a multiple of the ejecta velocity.
 *
 * Source: SAAMI, "Gun Recoil - Technical: Free Recoil Energy", Rev. 7/9/2018, which lists
 * 1.75 for high powered rifles, 1.50 for average length shotguns, 1.25 for long barrelled
 * shotguns and 1.50 for pistols and revolvers, and attributes the relationships to the
 * British Text Book of Small Arms (1929).
 *
 * Other published methods instead fix the gas velocity at a constant (4000 or 4700 fps are
 * both in circulation), which gives different answers for the same load. This tool follows
 * the SAAMI factors throughout and says so on screen, so the figures can be reproduced.
 */
export const GAS_VELOCITY_FACTORS: Record<FirearmType, number> = {
  rifle: 1.75,
  'shotgun-average': 1.5,
  'shotgun-long': 1.25,
  handgun: 1.5,
};

export function toKilograms(value: number, unit: GunMassUnit): number {
  return unit === 'lb' ? value * KILOGRAMS_PER_POUND : value;
}

export function fromKilograms(kilograms: number, unit: GunMassUnit): number {
  return unit === 'lb' ? kilograms / KILOGRAMS_PER_POUND : kilograms;
}

export function chargeToKilograms(value: number, unit: ChargeMassUnit): number {
  return unit === 'grain' ? value * KILOGRAMS_PER_GRAIN : value / 1000;
}

export function chargeFromKilograms(kilograms: number, unit: ChargeMassUnit): number {
  return unit === 'grain' ? kilograms / KILOGRAMS_PER_GRAIN : kilograms * 1000;
}

export function toMetersPerSecond(value: number, unit: VelocityUnit): number {
  return unit === 'fps' ? value * METERS_PER_FOOT : value;
}

export function fromMetersPerSecond(metersPerSecond: number, unit: VelocityUnit): number {
  return unit === 'fps' ? metersPerSecond / METERS_PER_FOOT : metersPerSecond;
}

export function toFootPounds(joules: number): number {
  return joules / JOULES_PER_FOOT_POUND;
}

/**
 * Decimals kept when a field is rewritten into another unit. One milligram for a charge in
 * grams, 0.01 grain (0.65 mg) for a charge in grains, one gram for the gun and 0.1 for a
 * velocity: fine enough that the rewritten number stands for the same load, coarse enough
 * to stay readable. Switching a unit back and forth can therefore move a value by half a
 * step of the unit it passed through.
 */
const GUN_MASS_DECIMALS: Record<GunMassUnit, number> = { kg: 3, lb: 3 };
const CHARGE_MASS_DECIMALS: Record<ChargeMassUnit, number> = { g: 3, grain: 2 };
const VELOCITY_DECIMALS: Record<VelocityUnit, number> = { 'm/s': 1, fps: 1 };

function round(value: number, decimals: number): number {
  // A draft the reader is still typing can be NaN, and it has to survive a unit change as a draft.
  if (!Number.isFinite(value)) return value;
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
}

export function convertGunMass(value: number, from: GunMassUnit, to: GunMassUnit): number {
  return from === to ? value : round(fromKilograms(toKilograms(value, from), to), GUN_MASS_DECIMALS[to]);
}

export function convertChargeMass(value: number, from: ChargeMassUnit, to: ChargeMassUnit): number {
  return from === to ? value : round(chargeFromKilograms(chargeToKilograms(value, from), to), CHARGE_MASS_DECIMALS[to]);
}

export function convertVelocity(value: number, from: VelocityUnit, to: VelocityUnit): number {
  return from === to ? value : round(fromMetersPerSecond(toMetersPerSecond(value, from), to), VELOCITY_DECIMALS[to]);
}

export type RecoilCautionKey = 'gunMass' | 'ejectaMass' | 'powderMass' | 'velocity';

/**
 * The band each quantity has to stay inside before the tool stops calling the entry a firearm.
 * These bounds are editorial, not from any standard: the momentum arithmetic holds for any
 * positive number, so a value outside the band is still calculated and only carries a warning.
 * The room is deliberately wide - an air rifle pellet at one end, a 3½ inch magnum shotshell
 * and the fastest small arms loads at the other - so that only plainly mistyped input trips it.
 */
export const PLAUSIBLE_RANGES: Record<RecoilCautionKey, { min: number; max: number }> = {
  gunMass: { min: 0.5, max: 20 },
  ejectaMass: { min: 0.0001, max: 0.2 },
  powderMass: { min: 0, max: 0.05 },
  velocity: { min: 50, max: 1500 },
};

export interface RecoilCaution {
  key: RecoilCautionKey;
  bound: 'below' | 'above';
  /** The bound that was crossed, in SI, so the screen can show it in whichever unit is selected. */
  limit: number;
}

export interface RecoilUnits {
  gunMassUnit: GunMassUnit;
  chargeMassUnit: ChargeMassUnit;
  velocityUnit: VelocityUnit;
}

export interface RecoilResult {
  gunMassKg: number;
  /** Projectile and wad column together: both leave the muzzle, so both carry momentum away. */
  ejectaMassKg: number;
  powderMassKg: number;
  velocityMs: number;
  gasFactor: number;
  gasVelocityMs: number;
  momentumKgMs: number;
  momentumLbFts: number;
  recoilVelocityMs: number;
  recoilVelocityFps: number;
  energyJoules: number;
  energyFootPounds: number;
  cautions: RecoilCaution[];
}

const isPositive = (value: number) => Number.isFinite(value) && value > 0;
const isNonNegative = (value: number) => Number.isFinite(value) && value >= 0;

function collectCautions(values: Record<RecoilCautionKey, number>): RecoilCaution[] {
  return (Object.keys(PLAUSIBLE_RANGES) as RecoilCautionKey[]).flatMap((key): RecoilCaution[] => {
    const { min, max } = PLAUSIBLE_RANGES[key];
    if (values[key] < min) return [{ key, bound: 'below', limit: min }];
    if (values[key] > max) return [{ key, bound: 'above', limit: max }];
    return [];
  });
}

/**
 * Free recoil from conservation of momentum, following SAAMI, "Gun Recoil - Technical:
 * Free Recoil Energy", Rev. 7/9/2018:
 *
 *   momentum  = (m_ejecta + f × m_powder) × v_muzzle
 *   v_recoil  = momentum / m_gun
 *   E_recoil  = ½ × m_gun × v_recoil²
 *
 * SAAMI equates the weight of the propellant gas with the weight of the powder charge,
 * because the gas itself cannot readily be weighed, and gives the gas an effective velocity
 * of f × v_muzzle with f from GAS_VELOCITY_FACTORS.
 *
 * SAAMI states the working formula in grains, pounds and feet per second, with 7000 grains
 * to the pound and a mass conversion of 32.17; its metric restatement carries the mass
 * conversion 9.8 and reports kilogram-metres. This implementation works in SI throughout -
 * kilograms, metres per second and joules - so no gravity constant enters the calculation
 * at all, and converts for display. The two agree: SAAMI's own worked example comes out at
 * 30.17 ft-lb here against the 30.22 ft-lb it prints from rounded intermediate values.
 */
export function calculateRecoil(load: RecoilLoad, units: RecoilUnits): RecoilResult | null {
  const gunMassKg = toKilograms(load.gunMass, units.gunMassUnit);
  const projectileMassKg = chargeToKilograms(load.projectileMass, units.chargeMassUnit);
  const wadMassKg = chargeToKilograms(load.wadMass, units.chargeMassUnit);
  const powderMassKg = chargeToKilograms(load.powderMass, units.chargeMassUnit);
  const velocityMs = toMetersPerSecond(load.velocity, units.velocityUnit);
  if (!isPositive(gunMassKg) || !isPositive(projectileMassKg) || !isPositive(velocityMs)) return null;
  if (!isNonNegative(wadMassKg) || !isNonNegative(powderMassKg)) return null;

  const ejectaMassKg = projectileMassKg + wadMassKg;
  const gasFactor = GAS_VELOCITY_FACTORS[load.firearmType];
  const momentumKgMs = (ejectaMassKg + gasFactor * powderMassKg) * velocityMs;
  const recoilVelocityMs = momentumKgMs / gunMassKg;
  const energyJoules = 0.5 * gunMassKg * recoilVelocityMs ** 2;
  return {
    gunMassKg,
    ejectaMassKg,
    powderMassKg,
    velocityMs,
    gasFactor,
    gasVelocityMs: gasFactor * velocityMs,
    momentumKgMs,
    momentumLbFts: momentumKgMs / (KILOGRAMS_PER_POUND * METERS_PER_FOOT),
    recoilVelocityMs,
    recoilVelocityFps: fromMetersPerSecond(recoilVelocityMs, 'fps'),
    energyJoules,
    energyFootPounds: toFootPounds(energyJoules),
    cautions: collectCautions({
      gunMass: gunMassKg,
      ejectaMass: ejectaMassKg,
      powderMass: powderMassKg,
      velocity: velocityMs,
    }),
  };
}

export interface RecoilComparison {
  /** B against A, signed: positive means B recoils harder. */
  energyPercent: number;
  velocityPercent: number;
  energyDifferenceJoules: number;
  recoilVelocityDifferenceMs: number;
}

export function compareRecoil(a: RecoilResult | null, b: RecoilResult | null): RecoilComparison | null {
  // A percentage needs A as its base, so a missing or zero A leaves the two results to be read side by side.
  if (a === null || b === null || !isPositive(a.energyJoules) || !isPositive(a.recoilVelocityMs)) return null;
  return {
    energyPercent: (b.energyJoules / a.energyJoules - 1) * 100,
    velocityPercent: (b.recoilVelocityMs / a.recoilVelocityMs - 1) * 100,
    energyDifferenceJoules: b.energyJoules - a.energyJoules,
    recoilVelocityDifferenceMs: b.recoilVelocityMs - a.recoilVelocityMs,
  };
}
