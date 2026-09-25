import { describe, expect, it } from 'vitest';

import { MOA_RADIANS } from '@/lib/sight-adjustment';
import {
  STANDARD_GRAVITY,
  adjustedMuzzleSpeedMs,
  airDensity,
  calculateTrajectory,
  humidAirDensity,
  offsetInClicks,
  powderSensitivityMsPerKelvin,
  resolveConditions,
  sampleTrajectory,
  saturationVapourPressurePa,
  toKelvin,
  vapourPressurePa,
  withHumidity,
  type TrajectoryInput,
} from '@/lib/trajectory';

const standardAir = {
  source: 'station',
  temperature: { value: 15, unit: 'c' },
  pressure: { value: 1013.25, unit: 'hpa' },
  altitude: { value: 0, unit: 'm' },
} satisfies TrajectoryInput['atmosphere'];

const steadyPowder = {
  sensitivity: { value: 0, unit: 'mps-per-c' },
  unit: 'c',
  reference: 15,
  temperature: 15,
} satisfies TrajectoryInput['powder'];

const input = (overrides: Partial<TrajectoryInput> = {}): TrajectoryInput => ({
  muzzleSpeed: { value: 800, unit: 'mps' },
  mass: { value: 10.9, unit: 'g' },
  ballisticCoefficient: 0.462,
  dragModel: 'g1',
  sightHeight: { value: 40, unit: 'mm' },
  distanceUnit: 'm',
  zeroDistance: 100,
  step: 100,
  maxRange: 500,
  dropUnit: 'cm',
  vitalRadius: 5,
  wind: { speed: 0, unit: 'mps', preset: '9', customFromDegrees: 270 },
  atmosphere: standardAir,
  humidityPercent: 0,
  inclineDegrees: 0,
  powder: steadyPowder,
  ...overrides,
});

describe('humid air', () => {
  it('matches the published vapour pressure of water', () => {
    // CRC Handbook of Chemistry and Physics, "Vapor Pressure of Water from 0 to 370 °C":
    // 0.6113 kPa at 0 °C, 2.3393 kPa at 20 °C, 4.2470 kPa at 30 °C and 12.352 kPa at 50 °C.
    // Buck (1981) claims a few hundredths of a per cent over -20 to 50 °C; 0.2 % is allowed here.
    const published: [number, number][] = [
      [0, 611.3],
      [20, 2339.3],
      [30, 4247.0],
      [50, 12352],
    ];
    for (const [celsius, pascals] of published)
      expect(Math.abs(saturationVapourPressurePa(toKelvin(celsius, 'c')) - pascals) / pascals).toBeLessThan(0.002);
  });

  it('applies Buck’s enhancement factor for water vapour in air', () => {
    // Buck (1981) eq. (8) over water with f = 1.0007 + 3.46e-6 P[hPa]: at 20 °C and 1000 hPa the
    // saturated partial pressure is 2337.28 × 1.00416 = 2347.01 Pa, not the pure-water 2337.28 Pa.
    const temperature = toKelvin(20, 'c');
    expect(vapourPressurePa(100000, temperature, 1)).toBeCloseTo(2347.006, 2);
    expect(vapourPressurePa(100000, temperature, 0.5)).toBeCloseTo(2347.006 / 2, 2);
    expect(humidAirDensity(100000, temperature, 1)).toBeCloseTo(1.17781688, 7);
  });

  it('agrees with the virtual temperature form meteorology writes it in', () => {
    // ρ = p / (R_d · T_v) with T_v = T / (1 - (e/p)(1 - ε)), ε = R_d / R_v ≈ 0.622: the same mixture
    // of two ideal gases rearranged, as in the WMO and every meteorology text.
    const pressure = 101325;
    const temperature = toKelvin(30, 'c');
    const vapour = vapourPressurePa(pressure, temperature, 1);
    const epsilon = 287.05287 / (8.314462618 / 0.01801528);
    const virtual = temperature / (1 - (vapour / pressure) * (1 - epsilon));
    expect(humidAirDensity(pressure, temperature, 1)).toBeCloseTo(pressure / (287.05287 * virtual), 10);
  });

  it('thins the air as it gets wetter, by about one and a half per cent on a saturated hot day', () => {
    const dry = resolveConditions({ ...standardAir, temperature: { value: 30, unit: 'c' } })!;
    expect(withHumidity(dry, 0)!.densityKgPerM3).toBeCloseTo(dry.densityKgPerM3, 12);
    const saturated = withHumidity(dry, 100)!;
    const ratio = saturated.densityKgPerM3 / dry.densityKgPerM3;
    expect(ratio).toBeGreaterThan(0.983);
    expect(ratio).toBeLessThan(0.986);
    // The speed of sound is left at the dry value; the page says so.
    expect(saturated.speedOfSoundMs).toBe(dry.speedOfSoundMs);
    expect(withHumidity(dry, -1)).toBeNull();
    expect(withHumidity(dry, 101)).toBeNull();
  });

  it('drops a bullet a little less in humid air', () => {
    const dry = calculateTrajectory(input({ atmosphere: { ...standardAir, temperature: { value: 30, unit: 'c' } } }))!;
    const wet = calculateTrajectory(
      input({ humidityPercent: 100, atmosphere: { ...standardAir, temperature: { value: 30, unit: 'c' } } }),
    )!;
    expect(wet.conditions.densityKgPerM3).toBeLessThan(dry.conditions.densityKgPerM3);
    expect(wet.rows.at(-1)!.dropMeters).toBeLessThan(dry.rows.at(-1)!.dropMeters);
    // Dry air is still the ideal gas the tables were built on.
    expect(dry.conditions.densityKgPerM3).toBeCloseTo(airDensity(101325, toKelvin(30, 'c')), 12);
  });
});

describe('shooting up and down a slope', () => {
  /** Air thin enough that drag cannot register, so the closed form on an incline has to come out. */
  const vacuum = (inclineDegrees: number) =>
    input({
      ballisticCoefficient: 2,
      atmosphere: { ...standardAir, pressure: { value: 0.0001, unit: 'hpa' } },
      inclineDegrees,
    });

  it('reproduces free flight on an incline when there is no air', () => {
    for (const inclineDegrees of [30, -30, 60]) {
      const result = calculateTrajectory(vacuum(inclineDegrees))!;
      const level = calculateTrajectory(vacuum(0))!;
      // The rifle is sighted in on the level and keeps that bore angle up the slope.
      expect(result.zeroAngleRadians).toBe(level.zeroAngleRadians);
      const theta = result.zeroAngleRadians;
      const phi = (inclineDegrees * Math.PI) / 180;
      const speed = result.muzzleSpeedMs;
      for (const row of result.rows) {
        // Along the line of sight x = v cosθ t - ½ g sinφ t²; across it y = -h + v sinθ t - ½ g cosφ t².
        const a = 0.5 * STANDARD_GRAVITY * Math.sin(phi);
        const b = speed * Math.cos(theta);
        const t = a === 0 ? row.distanceMeters / b : (b - Math.sqrt(b * b - 4 * a * row.distanceMeters)) / (2 * a);
        const height = -0.04 + speed * Math.sin(theta) * t - 0.5 * STANDARD_GRAVITY * Math.cos(phi) * t * t;
        expect(Math.abs(-row.dropMeters - height)).toBeLessThan(0.0005);
        expect(row.timeSeconds).toBeCloseTo(t, 5);
      }
    }
  });

  it('drops less than on the level whether the shot goes up or down', () => {
    const level = calculateTrajectory(input())!.rows.at(-1)!;
    const up = calculateTrajectory(input({ inclineDegrees: 30 }))!.rows.at(-1)!;
    const down = calculateTrajectory(input({ inclineDegrees: -30 }))!.rows.at(-1)!;
    expect(up.dropMeters).toBeLessThan(level.dropMeters);
    expect(down.dropMeters).toBeLessThan(level.dropMeters);
    // The rifleman's rule - hold what the horizontal distance needs - is close but not exact, which
    // is why the gravity is turned instead. At 30° and 500 m uphill it holds several per cent short.
    const flat = 500 * Math.cos(Math.PI / 6);
    const horizontal = calculateTrajectory(input({ step: flat, maxRange: flat }))!.rows[0]!;
    expect(Math.abs(up.dropMil - horizontal.dropMil) / horizontal.dropMil).toBeLessThan(0.1);
    expect(up.dropMil).toBeGreaterThan(horizontal.dropMil);
    // Uphill the bullet loses more speed to gravity, so it drops a little more than downhill.
    expect(up.dropMeters).toBeGreaterThan(down.dropMeters);
  });

  it('refuses a line of sight that points straight up or down', () => {
    expect(calculateTrajectory(input({ inclineDegrees: 90 }))).toBeNull();
    expect(calculateTrajectory(input({ inclineDegrees: -90 }))).toBeNull();
    expect(calculateTrajectory(input({ inclineDegrees: NaN }))).toBeNull();
  });

  it('gives the point blank range for level ground whatever the slope', () => {
    expect(calculateTrajectory(input({ inclineDegrees: 30 }))!.pointBlank).toEqual(
      calculateTrajectory(input())!.pointBlank,
    );
  });
});

describe('the powder temperature', () => {
  it('moves the velocity by the rate per degree, in either pair of units', () => {
    expect(
      adjustedMuzzleSpeedMs(800, { ...steadyPowder, sensitivity: { value: 0.5, unit: 'mps-per-c' }, temperature: 35 }),
    ).toBeCloseTo(810, 10);
    expect(
      adjustedMuzzleSpeedMs(800, { ...steadyPowder, sensitivity: { value: 0.5, unit: 'mps-per-c' }, temperature: -5 }),
    ).toBeCloseTo(790, 10);
    // 1 fps per °F is 0.3048 m/s per 5/9 K: 0.54864 m/s per K.
    expect(powderSensitivityMsPerKelvin(1, 'fps-per-f')).toBeCloseTo(0.54864, 10);
    expect(
      adjustedMuzzleSpeedMs(800, {
        sensitivity: { value: 1, unit: 'fps-per-f' },
        unit: 'f',
        reference: 59,
        temperature: 99,
      }),
    ).toBeCloseTo(800 + 40 * 0.3048, 8);
  });

  it('keeps the zero of the reference day, so warm powder shoots high at the zero distance', () => {
    const warm = calculateTrajectory(
      input({
        step: 100,
        maxRange: 100,
        powder: { ...steadyPowder, sensitivity: { value: 1, unit: 'mps-per-c' }, temperature: 35 },
      }),
    )!;
    expect(warm.muzzleSpeedMs).toBeCloseTo(820, 10);
    expect(warm.zeroMuzzleSpeedMs).toBeCloseTo(800, 10);
    expect(warm.rows[0]!.dropMeters).toBeLessThan(-0.0005);
    const steady = calculateTrajectory(input({ step: 100, maxRange: 100 }))!;
    expect(Math.abs(steady.rows[0]!.dropMeters)).toBeLessThan(0.0002);
  });

  it('refuses a velocity the correction takes to zero or below', () => {
    const frozen = { ...steadyPowder, sensitivity: { value: 100, unit: 'mps-per-c' as const }, temperature: 0 };
    expect(calculateTrajectory(input({ powder: frozen }))).toBeNull();
  });
});

describe('reading the trajectory between the rows', () => {
  it('agrees with the table row for row, in any order', () => {
    const table = calculateTrajectory(input())!;
    const samples = sampleTrajectory(input(), [500, 100, 300])!;
    const byDistance = new Map(table.rows.map((row) => [row.distanceMeters, row]));
    for (const sample of samples) {
      expect(sample).not.toBeNull();
      expect(sample!.dropMeters).toBeCloseTo(byDistance.get(sample!.distanceMeters)!.dropMeters, 12);
    }
    expect(sampleTrajectory(input(), [0])).toBeNull();
  });

  it('keeps the zero when only the velocity is changed', () => {
    const [slow] = sampleTrajectory(input(), [100], { muzzleSpeedMs: 790 })!;
    // Sighted in at 800 m/s, a slower round lands low at the zero distance.
    expect(slow!.dropMeters).toBeGreaterThan(0.0005);
  });
});

describe('clicks', () => {
  it('counts an offset in clicks the way the sight adjustment tool does', () => {
    // A quarter MOA click at 100 m moves the shot 100 000 mm × tan(1/4 MOA) = 7.2722 mm.
    const click = 100 * Math.tan(MOA_RADIANS / 4);
    expect(offsetInClicks(click * 10, 100, { preset: '1/4-moa', customMmPer100m: 10 })).toBeCloseTo(10, 9);
    // 0.1 mil at 300 m is 30 mm.
    expect(offsetInClicks(0.3, 300, { preset: '0.1-mil', customMmPer100m: 10 })).toBeCloseTo(10, 6);
    // A custom turret quoted as 10 mm per 100 m moves 20 mm per click at 200 m.
    expect(offsetInClicks(0.1, 200, { preset: 'custom', customMmPer100m: 10 })).toBeCloseTo(5, 9);
  });
});
