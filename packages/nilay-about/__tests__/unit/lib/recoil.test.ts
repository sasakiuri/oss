import { describe, expect, it } from 'vitest';

import {
  GAS_VELOCITY_FACTORS,
  JOULES_PER_FOOT_POUND,
  KILOGRAMS_PER_GRAIN,
  KILOGRAMS_PER_POUND,
  METERS_PER_FOOT,
  PLAUSIBLE_RANGES,
  calculateRecoil,
  chargeFromKilograms,
  chargeToKilograms,
  compareRecoil,
  convertChargeMass,
  convertGunMass,
  convertVelocity,
  fromKilograms,
  fromMetersPerSecond,
  toFootPounds,
  toKilograms,
  toMetersPerSecond,
  type RecoilLoad,
  type RecoilUnits,
} from '@/lib/recoil';

const imperial: RecoilUnits = { gunMassUnit: 'lb', chargeMassUnit: 'grain', velocityUnit: 'fps' };
const metric: RecoilUnits = { gunMassUnit: 'kg', chargeMassUnit: 'g', velocityUnit: 'm/s' };

/**
 * The worked example from SAAMI, "Gun Recoil - Technical: Free Recoil Energy", Rev. 7/9/2018:
 * a 7 lb average length shotgun firing 1¼ oz of No. 4 shot (546.9 gr) with 43 gr of wads and
 * 33.4 gr of powder at 1275 fps.
 */
const saamiShotgun = (overrides: Partial<RecoilLoad> = {}): RecoilLoad => ({
  gunMass: 7,
  projectileMass: 546.9,
  wadMass: 43,
  powderMass: 33.4,
  velocity: 1275,
  firearmType: 'shotgun-average',
  ...overrides,
});

describe('unit conversion', () => {
  it('matches the defined size of the grain, the pound and the foot-pound', () => {
    // A grain is 1/7000 lb, which the international pound of 0.45359237 kg makes 64.79891 mg exactly.
    expect(KILOGRAMS_PER_GRAIN * 1e6).toBeCloseTo(64.79891, 9);
    expect(KILOGRAMS_PER_POUND).toBe(0.45359237);
    expect(METERS_PER_FOOT).toBeCloseTo(0.3048, 12);
    // 1 ft-lbf = 0.3048 m × (0.45359237 kg × 9.80665 m/s²).
    expect(JOULES_PER_FOOT_POUND).toBeCloseTo(1.3558179483314004, 12);
  });
  it('round trips every unit the form offers', () => {
    expect(toKilograms(7, 'lb')).toBeCloseTo(3.17514659, 10);
    expect(toKilograms(3.2, 'kg')).toBe(3.2);
    expect(fromKilograms(toKilograms(7, 'lb'), 'lb')).toBeCloseTo(7, 10);
    expect(chargeToKilograms(7000, 'grain')).toBeCloseTo(toKilograms(1, 'lb'), 12);
    expect(chargeToKilograms(150, 'grain') * 1000).toBeCloseTo(9.7198365, 6);
    expect(chargeToKilograms(28.35, 'g')).toBeCloseTo(0.02835, 12);
    expect(chargeFromKilograms(chargeToKilograms(546.9, 'grain'), 'grain')).toBeCloseTo(546.9, 8);
    expect(toMetersPerSecond(1275, 'fps')).toBeCloseTo(388.62, 10);
    expect(toMetersPerSecond(400, 'm/s')).toBe(400);
    expect(fromMetersPerSecond(388.62, 'fps')).toBeCloseTo(1275, 10);
    expect(toFootPounds(JOULES_PER_FOOT_POUND)).toBeCloseTo(1, 12);
  });
  it('rewrites a field into another unit without changing what it stands for', () => {
    // 7 lb is 3.175 kg once the field is rounded to grams, and reads back as 7 lb.
    expect(convertGunMass(7, 'lb', 'kg')).toBe(3.175);
    expect(convertGunMass(3.175, 'kg', 'lb')).toBe(7);
    expect(convertChargeMass(150, 'grain', 'g')).toBe(9.72);
    expect(convertChargeMass(9.72, 'g', 'grain')).toBe(150);
    expect(convertVelocity(2800, 'fps', 'm/s')).toBe(853.4);
    // Rounding the metres per second to one decimal is what moves the last digit on the way back.
    expect(convertVelocity(853.4, 'm/s', 'fps')).toBe(2799.9);
    // The same unit is left exactly as typed, so opening the menu and closing it cannot round anything.
    expect(convertGunMass(3.17514659, 'kg', 'kg')).toBe(3.17514659);
    // A field being typed can be blank, and it has to stay blank through a unit change.
    expect(convertChargeMass(NaN, 'grain', 'g')).toBeNaN();
  });
});

describe('free recoil', () => {
  it('gives the gun the momentum the ejecta and the gas carry forward', () => {
    const result = calculateRecoil(saamiShotgun(), imperial)!;
    const forward = result.ejectaMassKg * result.velocityMs + result.powderMassKg * result.gasVelocityMs;
    expect(result.momentumKgMs).toBeCloseTo(forward, 12);
    expect(result.gunMassKg * result.recoilVelocityMs).toBeCloseTo(forward, 12);
    // Energy follows from the same momentum: E = p² / 2m.
    expect(result.energyJoules).toBeCloseTo(result.momentumKgMs ** 2 / (2 * result.gunMassKg), 12);
    expect(result.ejectaMassKg).toBeCloseTo(chargeToKilograms(589.9, 'grain'), 12);
  });
  it('reduces to the ejecta alone when there is no powder charge', () => {
    const result = calculateRecoil(saamiShotgun({ powderMass: 0, wadMass: 0 }), imperial)!;
    const expected = (chargeToKilograms(546.9, 'grain') * toMetersPerSecond(1275, 'fps')) / toKilograms(7, 'lb');
    expect(result.recoilVelocityMs).toBeCloseTo(expected, 12);
    // The gas velocity is still reported, because the factor applies to the muzzle velocity, not to the charge.
    expect(result.gasVelocityMs).toBeCloseTo(1.5 * toMetersPerSecond(1275, 'fps'), 10);
    expect(result.momentumKgMs).toBeCloseTo(chargeToKilograms(546.9, 'grain') * toMetersPerSecond(1275, 'fps'), 12);
  });
  it('scales the energy with the square of the recoil velocity', () => {
    const base = calculateRecoil(saamiShotgun(), imperial)!;
    const faster = calculateRecoil(saamiShotgun({ velocity: 2550 }), imperial)!;
    expect(faster.recoilVelocityMs / base.recoilVelocityMs).toBeCloseTo(2, 10);
    expect(faster.energyJoules / base.energyJoules).toBeCloseTo(4, 10);
    // Twice the gun for the same load halves the velocity and so halves the energy.
    const heavier = calculateRecoil(saamiShotgun({ gunMass: 14 }), imperial)!;
    expect(heavier.recoilVelocityMs / base.recoilVelocityMs).toBeCloseTo(0.5, 10);
    expect(heavier.energyJoules / base.energyJoules).toBeCloseTo(0.5, 10);
  });
  it('reads the same load identically in metric and in imperial units', () => {
    const inImperial = calculateRecoil(saamiShotgun(), imperial)!;
    const inMetric = calculateRecoil(
      {
        gunMass: toKilograms(7, 'lb'),
        projectileMass: chargeFromKilograms(chargeToKilograms(546.9, 'grain'), 'g'),
        wadMass: chargeFromKilograms(chargeToKilograms(43, 'grain'), 'g'),
        powderMass: chargeFromKilograms(chargeToKilograms(33.4, 'grain'), 'g'),
        velocity: toMetersPerSecond(1275, 'fps'),
        firearmType: 'shotgun-average',
      },
      metric,
    )!;
    expect(inMetric.energyJoules).toBeCloseTo(inImperial.energyJoules, 10);
    expect(inMetric.recoilVelocityMs).toBeCloseTo(inImperial.recoilVelocityMs, 10);
  });
  it('uses the propellant gas factor published for each firearm type', () => {
    // SAAMI, Rev. 7/9/2018, attributing the relationships to the British Text Book of Small Arms (1929).
    expect(GAS_VELOCITY_FACTORS).toEqual({
      rifle: 1.75,
      'shotgun-average': 1.5,
      'shotgun-long': 1.25,
      handgun: 1.5,
    });
    const byType = (['shotgun-long', 'shotgun-average', 'rifle'] as const).map(
      (firearmType) => calculateRecoil(saamiShotgun({ firearmType }), imperial)!.energyJoules,
    );
    // A larger factor means more gas momentum, so the same load recoils harder.
    expect(byType[0]).toBeLessThan(byType[1]!);
    expect(byType[1]).toBeLessThan(byType[2]!);
    expect(calculateRecoil(saamiShotgun({ firearmType: 'handgun' }), imperial)!.gasFactor).toBe(1.5);
  });
});

describe('published reference', () => {
  // The SAAMI worked example is the only reference used here, because it is the only one that
  // publishes every input the formula takes - gun, ejecta, charge, velocity and firearm type -
  // alongside its answer. A recoil table that omits the charge weight cannot settle a figure this
  // calculation is free to vary with the charge, so none is treated as a known value.
  it('reproduces the SAAMI worked example', () => {
    const result = calculateRecoil(saamiShotgun(), imperial)!;
    expect(result.momentumLbFts).toBeCloseTo(116.5714, 3);
    expect(result.recoilVelocityFps).toBeCloseTo(16.653, 3);
    expect(result.energyFootPounds).toBeCloseTo(30.17, 2);
    expect(result.energyJoules).toBeCloseTo(40.9, 1);
    // The document prints 30.22 ft-lb. It rounds ½M to 0.109 and the recoil velocity to 16.65 fps on the
    // way there, while this calculation stays in full precision, so a tenth of a foot-pound is the
    // tolerance that separates "the same method" from "a different method".
    expect(Math.abs(result.energyFootPounds - 30.22)).toBeLessThan(0.1);
  });
});

describe('a rifle load whose charge weight is assumed', () => {
  const dot308 = (powderMass: number) =>
    calculateRecoil(
      { gunMass: 7.5, projectileMass: 150, wadMass: 0, powderMass, velocity: 2800, firearmType: 'rifle' },
      imperial,
    )!;

  it('puts a 150 gr .308 Win in the range rifle recoil tables report, for any ordinary charge', () => {
    // Published rifle recoil tables put a 150 gr .308 Win at 2800 fps from a 7.5 lb rifle in the mid
    // teens of foot-pounds, but they do not publish the charge weight behind the figure. The charge is
    // an input of this formula, so the tables cannot be a reference value here; this only checks that
    // the answer stays in that region across the charges such a load is built with.
    for (const powderMass of [36, 39, 42]) {
      expect(dot308(powderMass).energyFootPounds).toBeGreaterThan(15);
      expect(dot308(powderMass).energyFootPounds).toBeLessThan(17);
    }
    // These two are recorded so a change in the arithmetic shows up, not because they are published.
    expect(dot308(39).energyFootPounds).toBeCloseTo(15.79, 2);
    expect(dot308(39).recoilVelocityFps).toBeCloseTo(11.64, 2);
  });
  it('moves far enough with the charge weight that an assumed charge cannot be hidden', () => {
    // A grain of powder is worth about a quarter of a foot-pound to this load, so a table that leaves
    // the charge out is already a foot-pound wide before any rounding - which is why it is not used above.
    const perGrain = dot308(40).energyFootPounds - dot308(39).energyFootPounds;
    expect(perGrain).toBeGreaterThan(0.2);
    expect(perGrain).toBeLessThan(0.3);
    expect(dot308(42).energyFootPounds - dot308(36).energyFootPounds).toBeGreaterThan(1);
  });
});

describe('unusable and extreme input', () => {
  it('returns nothing without a gun, a projectile and a velocity', () => {
    for (const gunMass of [0, -7, NaN, Infinity])
      expect(calculateRecoil(saamiShotgun({ gunMass }), imperial)).toBeNull();
    for (const projectileMass of [0, -1, NaN, Infinity])
      expect(calculateRecoil(saamiShotgun({ projectileMass }), imperial)).toBeNull();
    for (const velocity of [0, -1275, NaN, Infinity])
      expect(calculateRecoil(saamiShotgun({ velocity }), imperial)).toBeNull();
    for (const wadMass of [-1, NaN, Infinity]) expect(calculateRecoil(saamiShotgun({ wadMass }), imperial)).toBeNull();
    for (const powderMass of [-1, NaN, Infinity])
      expect(calculateRecoil(saamiShotgun({ powderMass }), imperial)).toBeNull();
    // A shotshell without a wad and a cartridge without powder are both real answers, not blanks.
    expect(calculateRecoil(saamiShotgun({ wadMass: 0, powderMass: 0 }), imperial)).not.toBeNull();
  });
  it('still calculates input outside the range of a real firearm, and says which field it was', () => {
    expect(calculateRecoil(saamiShotgun(), imperial)!.cautions).toEqual([]);
    const light = calculateRecoil({ ...saamiShotgun(), gunMass: 1, velocity: 1275 }, imperial)!;
    expect(light.cautions).toEqual([{ key: 'gunMass', bound: 'below', limit: PLAUSIBLE_RANGES.gunMass.min }]);
    expect(light.energyJoules).toBeGreaterThan(0);
    // A 1 kg gun is a light handgun rather than a mistake, so only the impossible velocity is flagged.
    const fast = calculateRecoil(
      { gunMass: 1, projectileMass: 10, wadMass: 0, powderMass: 2, velocity: 5000, firearmType: 'rifle' },
      metric,
    )!;
    expect(fast.cautions).toEqual([{ key: 'velocity', bound: 'above', limit: PLAUSIBLE_RANGES.velocity.max }]);
    expect(Number.isFinite(fast.energyJoules)).toBe(true);
    const tiny = calculateRecoil(
      { gunMass: 0.3, projectileMass: 0.05, wadMass: 0, powderMass: 0, velocity: 10, firearmType: 'handgun' },
      metric,
    )!;
    expect(tiny.cautions).toEqual([
      { key: 'gunMass', bound: 'below', limit: PLAUSIBLE_RANGES.gunMass.min },
      { key: 'ejectaMass', bound: 'below', limit: PLAUSIBLE_RANGES.ejectaMass.min },
      { key: 'velocity', bound: 'below', limit: PLAUSIBLE_RANGES.velocity.min },
    ]);
    const heavy = calculateRecoil(saamiShotgun({ gunMass: 50, projectileMass: 4000, powderMass: 1000 }), imperial)!;
    expect(heavy.cautions.map((caution) => `${caution.key}:${caution.bound}`)).toEqual([
      'gunMass:above',
      'ejectaMass:above',
      'powderMass:above',
    ]);
    // Zero powder is inside the band by definition, so it never asks to be checked.
    expect(calculateRecoil(saamiShotgun({ powderMass: 0 }), imperial)!.cautions).toEqual([]);
  });
});

describe('comparison', () => {
  const base = calculateRecoil(saamiShotgun(), imperial)!;

  it('reports how much harder the second condition recoils', () => {
    expect(compareRecoil(base, base)).toMatchObject({ energyPercent: 0, velocityPercent: 0 });
    const faster = calculateRecoil(saamiShotgun({ velocity: 2550 }), imperial)!;
    const comparison = compareRecoil(base, faster)!;
    expect(comparison.velocityPercent).toBeCloseTo(100, 10);
    expect(comparison.energyPercent).toBeCloseTo(300, 10);
    expect(comparison.energyDifferenceJoules).toBeCloseTo(faster.energyJoules - base.energyJoules, 12);
    expect(comparison.recoilVelocityDifferenceMs).toBeCloseTo(faster.recoilVelocityMs - base.recoilVelocityMs, 12);
  });
  it('reports a lighter load as a negative percentage', () => {
    const lighter = calculateRecoil(saamiShotgun({ projectileMass: 437.5, wadMass: 35, powderMass: 26 }), imperial)!;
    const comparison = compareRecoil(base, lighter)!;
    expect(comparison.energyPercent).toBeLessThan(0);
    expect(comparison.energyPercent).toBeCloseTo((lighter.energyJoules / base.energyJoules - 1) * 100, 10);
  });
  it('has nothing to compare while either condition is incomplete', () => {
    expect(compareRecoil(null, base)).toBeNull();
    expect(compareRecoil(base, null)).toBeNull();
    expect(compareRecoil(null, null)).toBeNull();
  });
});
