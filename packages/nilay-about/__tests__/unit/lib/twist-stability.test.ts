import { describe, expect, it } from 'vitest';

import type { AtmosphereSetting } from '@/lib/schemas/trajectory';
import { MM_PER_INCH } from '@/lib/sight-adjustment';
import { STANDARD_PRESSURE_HPA, resolveConditions } from '@/lib/trajectory';
import {
  ARMY_STANDARD_METRO_PRESSURE_PA,
  LEAD_DENSITY_G_PER_CM3,
  MILLER_CONSTANT,
  PLAUSIBLE_RANGES,
  REFERENCE_VELOCITY_FPS,
  VELOCITY_FLOOR_FPS,
  atmosphereFactor,
  bulletFromMillimeters,
  bulletToMillimeters,
  calculateTwistStability,
  convertBulletLength,
  convertMass,
  convertSpeed,
  massFromKilograms,
  maxLengthInch,
  requiredTwistInch,
  stabilityBand,
  stabilityFactor,
  velocityFactor,
  type TwistStabilitySettings,
} from '@/lib/twist-stability';

/**
 * Army Standard Metro, the atmosphere Miller's constant was fitted at: 59 °F and 750 mm of
 * mercury. Entered as a pressure measured at the firing point, because that is the branch
 * that uses a reading as it stands.
 */
const armyStandardMetro: AtmosphereSetting = {
  source: 'station',
  temperature: { value: 15, unit: 'c' },
  pressure: { value: ARMY_STANDARD_METRO_PRESSURE_PA / 100, unit: 'hpa' },
  altitude: { value: 0, unit: 'm' },
};

/**
 * Case 1 of Don Miller, "A New Rule for Estimating Rifling Twist", Precision Shooting, March
 * 2005: the 168 gr Sierra International, 0.308 in across and 3.98 calibers long, measured at
 * the Ballistic Research Laboratory as s = 1.80 at 2800 ft/s. The paper's own arithmetic on
 * it is t² = 1429.8, t = 37.813 calibers and T = 11.65 in, against an actual 12 in twist.
 */
const sierraInternational = {
  massGrains: 168,
  diameterInch: 0.308,
  lengthInch: 3.98 * 0.308,
};

/**
 * The Dunham's Bay case the same paper analyses: a 70 gr 6 mm boat tail, 0.243 in across and
 * 0.83 in long, fired at 3350 ft/s from a 14 in twist at -10 °F, which yawed and shot wild.
 */
const dunhamsBay = {
  massGrains: 70,
  diameterInch: 0.243,
  lengthInch: 0.83,
  twistInch: 14,
  velocityFps: 3350,
};

const settings = (overrides: Partial<TwistStabilitySettings> = {}): TwistStabilitySettings => ({
  bulletUnit: 'inch',
  twistUnit: 'inch',
  massUnit: 'grain',
  speedUnit: 'fps',
  diameter: 0.308,
  length: sierraInternational.lengthInch,
  mass: 168,
  twist: 12,
  muzzleSpeed: REFERENCE_VELOCITY_FPS,
  targetStability: 1.5,
  atmosphere: armyStandardMetro,
  ...overrides,
});

describe('the rule against the paper it comes from', () => {
  it('reproduces the twist the paper works out for the Sierra International', () => {
    const { massGrains, diameterInch, lengthInch } = sierraInternational;
    // Eq (A): t² = 30m / (s d³ l (1 + l²)), which the paper evaluates as 1429.8 calibers².
    const twistCalibers = requiredTwistInch(massGrains, diameterInch, lengthInch, 1.8, 1) / diameterInch;
    expect(twistCalibers ** 2).toBeCloseTo(1429.8, 0);
    expect(twistCalibers).toBeCloseTo(37.813, 2);
    expect(requiredTwistInch(massGrains, diameterInch, lengthInch, 1.8, 1)).toBeCloseTo(11.65, 2);
  });

  it('reproduces the twist the paper works out for an aluminium alloy projectile', () => {
    // Case 2: the 5 caliber Army Navy Spinner Rocket in Dural, density 2.8 against the 10.9 of
    // a jacketed bullet, measured at s = 2.59. The rule carries a density it never asks for.
    const diameterInch = 0.7874;
    const twistCalibers = requiredTwistInch(1037, diameterInch, 5 * diameterInch, 2.59, 1) / diameterInch;
    expect(twistCalibers ** 2).toBeCloseTo(189.27, 1);
    expect(twistCalibers).toBeCloseTo(13.76, 2);
  });

  it('follows the paper through the Dunham’s Bay case, step by step', () => {
    const { massGrains, diameterInch, lengthInch, twistInch, velocityFps } = dunhamsBay;
    // A safe twist at 2800 ft/s for the paper's s = 2: 9.994 in.
    const safeTwist = requiredTwistInch(massGrains, diameterInch, lengthInch, 2, 1);
    expect(safeTwist).toBeCloseTo(9.994, 3);

    // At 3350 ft/s the velocity correction is 1.0616, and the twist moves by its square root.
    const fv = velocityFactor(velocityFps);
    expect(fv).toBeCloseTo(1.0616, 4);
    expect(safeTwist * Math.sqrt(fv)).toBeCloseTo(10.3, 2);

    // The stability factor of the 14 in barrel it was actually shot in, at standard conditions.
    // The paper prints 1.083, reached through eq (D) from its rounded 10.30 in twist; carrying
    // the unrounded numbers through instead lands three ten-thousandths away.
    const warm = stabilityFactor(massGrains, diameterInch, lengthInch, twistInch) * fv;
    expect(warm).toBeCloseTo(1.0819, 4);
    expect(warm).toBeCloseTo(1.083, 2);

    // At -10 °F the air is denser and the same barrel drops below 1.0: the bullet was unstable.
    const cold = resolveConditions({ ...armyStandardMetro, temperature: { value: -10, unit: 'f' } });
    expect(cold).not.toBeNull();
    const fa = atmosphereFactor(cold!);
    expect(fa).toBeCloseTo(0.867, 3);
    expect(warm * fa).toBeCloseTo(0.938, 3);
    expect(stabilityBand(warm * fa)).toBe('unstable');

    // Eq (D), s₂t₂² = s₁t₁²: a 13 in twist is barely stable and a 12 in twist is at the low end.
    expect(warm * fa * (14 / 13) ** 2).toBeCloseTo(1.089, 2);
    expect(warm * fa * (14 / 12) ** 2).toBeCloseTo(1.277, 2);
  });

  it('holds the velocity correction at the speed of sound the paper uses', () => {
    expect(velocityFactor(REFERENCE_VELOCITY_FPS)).toBe(1);
    expect(velocityFactor(VELOCITY_FLOOR_FPS)).toBeCloseTo(0.7368, 4);
    // An air rifle is far below the floor, so it is read at the floor rather than extrapolated.
    expect(velocityFactor(700)).toBe(velocityFactor(VELOCITY_FLOOR_FPS));
    expect(velocityFactor(0)).toBeNaN();
  });

  it('measures the air against Army Standard Metro rather than the ISO atmosphere', () => {
    const metro = resolveConditions(armyStandardMetro);
    expect(metro).not.toBeNull();
    // At the conditions the constant was fitted at, the correction does nothing at all.
    expect(atmosphereFactor(metro!)).toBeCloseTo(1, 10);

    // The trajectory tool's reference atmosphere is 1013.25 hPa, which is thicker air: the
    // same bullet reads about 1.3 % less stable there than a calculator referred to 29.92 inHg.
    const iso = resolveConditions({ ...armyStandardMetro, pressure: { value: STANDARD_PRESSURE_HPA, unit: 'hpa' } });
    expect(atmosphereFactor(iso!)).toBeCloseTo(0.9868, 4);

    // Colder air is denser and costs stability; thinner air at height gives it back.
    const cold = resolveConditions({ ...armyStandardMetro, temperature: { value: -20, unit: 'c' } });
    expect(atmosphereFactor(cold!)).toBeLessThan(1);
    const high = resolveConditions({
      source: 'altitude',
      temperature: { value: 15, unit: 'c' },
      pressure: { value: STANDARD_PRESSURE_HPA, unit: 'hpa' },
      altitude: { value: 2000, unit: 'm' },
    });
    expect(atmosphereFactor(high!)).toBeGreaterThan(1.2);
  });

  it('agrees with the altitude correction it does not implement', () => {
    // Eq (I) of the paper estimates the air at a height as exp(3.158e-5 h) with h in feet.
    // The atmosphere card reaches the same place through the ISO 2533 barometric formula, so
    // the shape of that estimate is checked here rather than the estimate being carried too.
    for (const meters of [500, 1000, 2000, 3000]) {
      const byBarometricFormula = atmosphereFactor(
        resolveConditions({
          source: 'altitude',
          temperature: { value: 15, unit: 'c' },
          pressure: { value: STANDARD_PRESSURE_HPA, unit: 'hpa' },
          altitude: { value: meters, unit: 'm' },
        })!,
      );
      const byMillersEstimate = Math.exp(3.158e-5 * (meters / 0.3048));
      // They agree to half a per cent at 500 m and drift to four and a half by 3000 m, with the
      // temperature left at the standard 15 °C. Miller's single exponential has to stand for the
      // whole atmosphere at a height, temperature included, which is the reason the tool asks
      // for a temperature and a pressure instead of taking it.
      expect(Math.abs(byBarometricFormula / byMillersEstimate - 1)).toBeLessThan(0.05);
    }
  });
});

describe('the answers the tool gives back', () => {
  it('turns the rule around and gets the same bullet back', () => {
    const { massGrains, diameterInch, lengthInch, twistInch } = dunhamsBay;
    for (const target of [1.0, 1.3, 1.5, 2.0, 3.5]) {
      // A twist worked out for a stability factor has to produce that factor again.
      const twist = requiredTwistInch(massGrains, diameterInch, lengthInch, target, 1);
      expect(stabilityFactor(massGrains, diameterInch, lengthInch, twist)).toBeCloseTo(target, 10);

      // And so does the longest bullet the same barrel holds at it: the cubic root is fed back
      // through the rule rather than taken on trust.
      const length = maxLengthInch(massGrains, diameterInch, twistInch, target, 1);
      expect(stabilityFactor(massGrains, diameterInch, length, twistInch)).toBeCloseTo(target, 10);
    }
  });

  it('carries the velocity and atmosphere corrections into both answers', () => {
    const { massGrains, diameterInch, lengthInch, twistInch } = dunhamsBay;
    const correction = 1.0616 * 0.867;
    const twist = requiredTwistInch(massGrains, diameterInch, lengthInch, 1.5, correction);
    expect(stabilityFactor(massGrains, diameterInch, lengthInch, twist) * correction).toBeCloseTo(1.5, 10);
    const length = maxLengthInch(massGrains, diameterInch, twistInch, 1.5, correction);
    expect(stabilityFactor(massGrains, diameterInch, length, twistInch) * correction).toBeCloseTo(1.5, 10);
  });

  it('makes a tighter twist more stable and a longer bullet less', () => {
    const { massGrains, diameterInch, lengthInch } = dunhamsBay;
    const at = (twist: number) => stabilityFactor(massGrains, diameterInch, lengthInch, twist);
    expect(at(8)).toBeGreaterThan(at(10));
    expect(at(10)).toBeGreaterThan(at(14));
    // Stability goes with the inverse square of the twist, which eq (D) states as s₂t₂² = s₁t₁².
    expect(at(14) * 14 ** 2).toBeCloseTo(at(10) * 10 ** 2, 10);

    const longer = (length: number) => stabilityFactor(massGrains, diameterInch, length, 10);
    expect(longer(0.83)).toBeGreaterThan(longer(0.95));
    // The copper bullet case: the same weight stretched out is the whole reason for the tool.
    expect(longer(1.2)).toBeLessThan(longer(0.83));
  });

  it('places the bands where the published recommendations fall', () => {
    expect(stabilityBand(0.99)).toBe('unstable');
    expect(stabilityBand(1)).toBe('marginal');
    expect(stabilityBand(1.3)).toBe('marginal');
    expect(stabilityBand(1.5)).toBe('adequate');
    expect(stabilityBand(4)).toBe('adequate');
  });

  it('refuses a bullet it cannot measure rather than inventing one', () => {
    expect(calculateTwistStability(settings({ diameter: NaN }))).toBeNull();
    expect(calculateTwistStability(settings({ length: 0 }))).toBeNull();
    expect(calculateTwistStability(settings({ mass: -1 }))).toBeNull();
    expect(calculateTwistStability(settings({ twist: NaN }))).toBeNull();
    expect(calculateTwistStability(settings({ muzzleSpeed: 0 }))).toBeNull();
    expect(calculateTwistStability(settings({ targetStability: NaN }))).toBeNull();
    expect(
      calculateTwistStability(
        settings({ atmosphere: { ...armyStandardMetro, temperature: { value: -300, unit: 'c' } } }),
      ),
    ).toBeNull();
  });
});

describe('the whole calculation from the fields as they are typed', () => {
  it('reads the opening bullet the same way whichever unit it is entered in', () => {
    const imperial = calculateTwistStability(settings());
    expect(imperial).not.toBeNull();
    // The BRL bullet of case 1 in a 12 in barrel: the rule gives 1.70 where the range measured
    // 1.80 in the same barrel, the few per cent on the safe side the paper reports.
    expect(imperial!.stability).toBeCloseTo(1.6954, 4);
    expect(imperial!.band).toBe('adequate');
    expect(imperial!.lengthCalibers).toBeCloseTo(3.98, 10);

    const metric = calculateTwistStability(
      settings({
        bulletUnit: 'mm',
        twistUnit: 'mm',
        massUnit: 'g',
        speedUnit: 'mps',
        diameter: bulletToMillimeters(0.308, 'inch'),
        length: bulletToMillimeters(sierraInternational.lengthInch, 'inch'),
        mass: massFromKilograms(168 * 6.479891e-5, 'g'),
        twist: bulletToMillimeters(12, 'inch'),
        muzzleSpeed: REFERENCE_VELOCITY_FPS * 0.3048,
      }),
    );
    expect(metric!.stability).toBeCloseTo(imperial!.stability, 6);
  });

  it('breaks the answer into the rule and the two corrections', () => {
    const result = calculateTwistStability(
      settings({
        muzzleSpeed: 3350,
        atmosphere: { ...armyStandardMetro, temperature: { value: -10, unit: 'f' } },
      }),
    );
    expect(result).not.toBeNull();
    // The parts multiply back to the whole, so the screen can show where the answer came from.
    expect(result!.standardStability * result!.velocityFactor * result!.atmosphereFactor).toBeCloseTo(
      result!.stability,
      12,
    );
    expect(result!.velocityFactor).toBeCloseTo(1.0616, 4);
    expect(result!.atmosphereFactor).toBeCloseTo(0.867, 3);
    expect(result!.velocityFloorApplied).toBe(false);
  });

  it('says when an air rifle has fallen below the velocity correction', () => {
    const pellet = calculateTwistStability(
      settings({
        bulletUnit: 'mm',
        twistUnit: 'mm',
        massUnit: 'g',
        speedUnit: 'mps',
        diameter: 4.5,
        length: 6.5,
        mass: 0.55,
        twist: 450,
        muzzleSpeed: 280,
      }),
    );
    expect(pellet).not.toBeNull();
    expect(pellet!.velocityFloorApplied).toBe(true);
    expect(pellet!.velocityFactor).toBeCloseTo(velocityFactor(VELOCITY_FLOOR_FPS), 12);
  });

  it('answers the copper bullet question: the longest bullet of this weight the barrel holds', () => {
    const result = calculateTwistStability(settings({ targetStability: 1.5 }));
    expect(result).not.toBeNull();
    // The bullet in hand is 31.1 mm and already stable, so the barrel has length in hand.
    expect(result!.maxLengthMm).toBeGreaterThan(result!.lengthMm);
    // Stretching it to exactly that length lands on the wanted stability factor.
    const stretched = calculateTwistStability(
      settings({ bulletUnit: 'mm', diameter: result!.diameterMm, length: result!.maxLengthMm, targetStability: 1.5 }),
    );
    expect(stretched!.stability).toBeCloseTo(1.5, 6);
    // And the twist it asks for is the one that barrel already has.
    expect(stretched!.requiredTwistMm / MM_PER_INCH).toBeCloseTo(12, 6);
  });

  it('cautions about input that cannot be a bullet in a barrel, and calculates it anyway', () => {
    const slip = calculateTwistStability(
      // The commonest slip there is: a 31.1 mm bullet entered as 31.1 inches.
      settings({ length: 31.14 }),
    );
    expect(slip).not.toBeNull();
    expect(slip!.stability).toBeGreaterThan(0);
    expect(slip!.cautions.map((caution) => caution.key)).toContain('lengthCalibers');

    // Weight, length and diameter that no metal could hold together.
    const dense = calculateTwistStability(settings({ massUnit: 'g', mass: 168 }));
    expect(dense!.cylinderDensity).toBeGreaterThan(LEAD_DENSITY_G_PER_CM3);
    expect(dense!.cautions.map((caution) => caution.key)).toContain('density');

    // A real bullet is never as dense as the cylinder around it, so the opening one is clear.
    const ordinary = calculateTwistStability(settings());
    expect(ordinary!.cylinderDensity).toBeLessThan(LEAD_DENSITY_G_PER_CM3);
    expect(ordinary!.cautions).toEqual([]);

    for (const [key, range] of Object.entries(PLAUSIBLE_RANGES)) {
      expect(range.min).toBeLessThan(range.max);
      expect(key).toBeTruthy();
    }
  });
});

describe('rewriting a field into another unit', () => {
  it('keeps the bullet the same size', () => {
    expect(convertBulletLength(0.308, 'inch', 'mm')).toBe(7.82);
    expect(convertBulletLength(7.82, 'mm', 'inch')).toBe(0.3079);
    expect(bulletToMillimeters(1, 'inch')).toBe(MM_PER_INCH);
    expect(bulletFromMillimeters(MM_PER_INCH, 'inch')).toBe(1);
    expect(bulletToMillimeters(12, 'mm')).toBe(12);
  });

  it('keeps the same weight and the same speed', () => {
    expect(convertMass(168, 'grain', 'g')).toBe(10.886);
    expect(convertMass(10.886, 'g', 'grain')).toBe(168);
    expect(convertSpeed(2800, 'fps', 'mps')).toBe(853.4);
    expect(convertSpeed(853.4, 'mps', 'fps')).toBe(2799.9);
    expect(convertSpeed(800, 'mps', 'mps')).toBe(800);
  });

  it('leaves a half typed field alone', () => {
    expect(convertBulletLength(NaN, 'inch', 'mm')).toBeNaN();
    expect(convertMass(NaN, 'grain', 'g')).toBeNaN();
    expect(convertSpeed(NaN, 'fps', 'mps')).toBeNaN();
  });

  it('states the constant it was fitted with', () => {
    expect(MILLER_CONSTANT).toBe(30);
    // 750 mmHg, not the 1013.25 hPa of the ISO 2533 atmosphere.
    expect(ARMY_STANDARD_METRO_PRESSURE_PA / 100).toBeCloseTo(999.918, 3);
    expect(ARMY_STANDARD_METRO_PRESSURE_PA).toBeLessThan(STANDARD_PRESSURE_HPA * 100);
  });
});
