import { describe, expect, it } from 'vitest';

import { MIL_RADIANS, MM_PER_INCH, MOA_RADIANS, angularSizeMm, toMeters } from '@/lib/sight-adjustment';
import {
  BC_UNIT_KG_PER_SQUARE_METER,
  JOULES_PER_FOOT_POUND,
  MAX_TABLE_ROWS,
  MAX_TIME_STEP_SECONDS,
  STANDARD_AIR_DENSITY,
  STANDARD_GRAVITY,
  airDensity,
  calculateTrajectory,
  departureAngle,
  dropsAtAngle,
  dropsFromZero,
  fromMetersToDropUnit,
  geopotentialHeight,
  muzzleEnergy,
  resolveConditions,
  speedOfSound,
  standardPressureAtGeopotentialPa,
  standardPressurePa,
  toKelvin,
  toKilograms,
  toMetersPerSecond,
  toPascals,
  windDirectionDegrees,
  windToMetersPerSecond,
  type ShotDescription,
  type TrajectoryInput,
} from '@/lib/trajectory';
import { DRAG_TABLE_RANGE, dragCoefficient } from '@/lib/trajectory-drag';

const standardAir = {
  source: 'station',
  temperature: { value: 15, unit: 'c' },
  pressure: { value: 1013.25, unit: 'hpa' },
  altitude: { value: 0, unit: 'm' },
} satisfies TrajectoryInput['atmosphere'];

const noWind = { speed: 0, unit: 'mps', preset: '9', customFromDegrees: 270 } satisfies TrajectoryInput['wind'];

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
  wind: noWind,
  atmosphere: standardAir,
  humidityPercent: 0,
  inclineDegrees: 0,
  powder: steadyPowder,
  ...overrides,
});

const inches = (meters: number) => fromMetersToDropUnit(meters, 'inch');
const feetPerSecond = (metersPerSecond: number) => metersPerSecond / 0.3048;
const footPounds = (joules: number) => joules / JOULES_PER_FOOT_POUND;

describe('units and atmosphere', () => {
  it('converts the units both systems of shooting are written in', () => {
    // A grain is 1/7000 lb, a foot is 0.3048 m, a mile per hour is 1609.344 m in 3600 s.
    expect(toKilograms(7000, 'grain')).toBeCloseTo(0.45359237, 10);
    expect(toKilograms(168, 'grain')).toBeCloseTo(0.01088622, 8);
    expect(toKilograms(10.9, 'g')).toBeCloseTo(0.0109, 10);
    expect(toMetersPerSecond(1000, 'fps')).toBeCloseTo(304.8, 10);
    expect(toMetersPerSecond(800, 'mps')).toBe(800);
    expect(windToMetersPerSecond(10, 'mph')).toBeCloseTo(4.4704, 10);
    expect(fromMetersToDropUnit(0.0254, 'inch')).toBeCloseTo(1, 10);
    expect(fromMetersToDropUnit(0.5, 'cm')).toBeCloseTo(50, 10);
    expect(toKelvin(59, 'f')).toBeCloseTo(288.15, 10);
    expect(toKelvin(15, 'c')).toBeCloseTo(288.15, 10);
    expect(toPascals(29.92, 'inhg')).toBeCloseTo(101320.76, 2);
    expect(toPascals(1013.25, 'hpa')).toBeCloseTo(101325, 10);
  });

  it('matches the reference atmosphere of ISO 2533', () => {
    // ISO 2533 gives 1.225 kg/m³ and 340.294 m/s at 15 °C and 1013.25 hPa at sea level.
    expect(STANDARD_AIR_DENSITY).toBeCloseTo(1.225, 3);
    expect(airDensity(101325, 288.15)).toBeCloseTo(1.225, 3);
    expect(speedOfSound(288.15)).toBeCloseTo(340.294, 2);
    // Its pressures are tabulated against geopotential height: 89874.6 Pa at 1000 m, 79495.2 Pa at 2000 m.
    expect(standardPressureAtGeopotentialPa(0)).toBeCloseTo(101325, 6);
    expect(standardPressureAtGeopotentialPa(1000)).toBeCloseTo(89874.6, 0);
    expect(standardPressureAtGeopotentialPa(2000)).toBeCloseTo(79495.2, 0);
    // A height off a map is geometric, and sits a little above the geopotential height it answers to.
    expect(geopotentialHeight(0)).toBe(0);
    expect(geopotentialHeight(1000)).toBeCloseTo(999.84, 2);
    expect(geopotentialHeight(9000)).toBeCloseTo(8987.28, 1);
    // Reading a map height straight into the formula would understate the pressure at 9000 m
    // by about two parts in a thousand, which is why the conversion is not skipped.
    const skipped = standardPressureAtGeopotentialPa(9000) / standardPressurePa(9000);
    expect(1 - skipped).toBeGreaterThan(0.001);
    expect(1 - skipped).toBeLessThan(0.004);
    // Colder air is denser and carries sound more slowly.
    expect(airDensity(101325, toKelvin(-10, 'c'))).toBeGreaterThan(STANDARD_AIR_DENSITY);
    expect(speedOfSound(toKelvin(-10, 'c'))).toBeLessThan(speedOfSound(toKelvin(30, 'c')));
  });

  it('names the wind by the clock face it blows from', () => {
    expect(windDirectionDegrees({ preset: '12', customFromDegrees: 0 })).toBe(0);
    expect(windDirectionDegrees({ preset: '3', customFromDegrees: 0 })).toBe(90);
    expect(windDirectionDegrees({ preset: '9', customFromDegrees: 0 })).toBe(270);
    expect(windDirectionDegrees({ preset: 'custom', customFromDegrees: 200 })).toBe(200);
  });

  it('gives the muzzle energy from a weight and a chronograph alone', () => {
    // A 16 grain pellet at 580 fps, the order an air rifle is quoted at.
    const air = muzzleEnergy({ value: 16, unit: 'grain' }, { value: 580, unit: 'fps' })!;
    expect(air.footPounds).toBeCloseTo(11.95, 2);
    expect(air.joules).toBeCloseTo(air.footPounds * JOULES_PER_FOOT_POUND, 10);
    // ½mv² in SI for the rifle load the tables below use.
    const rifle = muzzleEnergy({ value: 10.9, unit: 'g' }, { value: 800, unit: 'mps' })!;
    expect(rifle.joules).toBeCloseTo(3488, 0);
    expect(muzzleEnergy({ value: 0, unit: 'g' }, { value: 800, unit: 'mps' })).toBeNull();
    expect(muzzleEnergy({ value: 10.9, unit: 'g' }, { value: NaN, unit: 'mps' })).toBeNull();
  });
});

describe('standard drag functions', () => {
  it('returns the published value at each tabulated Mach number', () => {
    // Spot values from the G1 and G7 tabulations of McCoy's Modern Exterior Ballistics.
    expect(dragCoefficient('g1', 0)).toBe(0.2629);
    expect(dragCoefficient('g1', 1)).toBe(0.4805);
    expect(dragCoefficient('g1', 2)).toBe(0.5934);
    expect(dragCoefficient('g7', 0)).toBe(0.1198);
    expect(dragCoefficient('g7', 1)).toBe(0.3803);
    expect(dragCoefficient('g7', 2)).toBe(0.298);
  });

  it('runs a straight line between neighbouring points and holds the ends', () => {
    expect(dragCoefficient('g1', 0.025)).toBeCloseTo((0.2629 + 0.2558) / 2, 10);
    expect(dragCoefficient('g7', 2.025)).toBeCloseTo((0.298 + 0.2951) / 2, 10);
    // Held flat outside the published range rather than extrapolated into invented drag.
    expect(dragCoefficient('g1', -1)).toBe(dragCoefficient('g1', DRAG_TABLE_RANGE.g1.min));
    expect(dragCoefficient('g1', 99)).toBe(dragCoefficient('g1', DRAG_TABLE_RANGE.g1.max));
    expect(dragCoefficient('g7', 99)).toBe(0.1618);
    expect(dragCoefficient('g1', NaN)).toBeNaN();
  });

  it('never leaves the band its two neighbours set', () => {
    for (const model of ['g1', 'g7'] as const) {
      for (let mach = 0; mach <= 5; mach += 0.001) {
        const drag = dragCoefficient(model, mach);
        expect(drag).toBeGreaterThan(0);
        expect(drag).toBeLessThan(0.7);
      }
    }
  });

  it('shows why a coefficient has to be quoted against its own drag function', () => {
    // Around Mach 2 the G1 standard projectile carries about twice the drag of the G7 one,
    // which is where the rule that a G7 coefficient is roughly half a G1 one comes from.
    expect(dragCoefficient('g1', 2) / dragCoefficient('g7', 2)).toBeGreaterThan(1.9);
    expect(dragCoefficient('g1', 2) / dragCoefficient('g7', 2)).toBeLessThan(2.1);
  });
});

/**
 * Cross-checks against tables the makers publish for a bullet whose G1 coefficient they also publish.
 *
 * The tolerances are not a guess at the model's own accuracy; they are the width of the
 * gap between a printed chart and any solver that reads one coefficient for the whole
 * flight. Makers quote a single number, while the coefficient of a real bullet drifts as
 * it slows: Sierra publishes this bullet in three velocity bands. Everything below stays
 * inside one per cent on velocity and about one and a half on the drop, which at 500 yd
 * is half an inch against the five inches a one minute rifle already spreads there.
 */
describe('published ballistic tables', () => {
  // Federal Gold Medal Sierra MatchKing 308 Win 168 gr (GM308M): 2650 fps, G1 BC 0.462,
  // sights 1.5 inch over the bore, zeroed at 200 yd, from federalpremium.com (2026-09-22).
  const federal = (overrides: Partial<TrajectoryInput> = {}) =>
    input({
      muzzleSpeed: { value: 2650, unit: 'fps' },
      mass: { value: 168, unit: 'grain' },
      sightHeight: { value: 1.5, unit: 'inch' },
      distanceUnit: 'yd',
      zeroDistance: 200,
      step: 100,
      maxRange: 500,
      dropUnit: 'inch',
      vitalRadius: 2,
      ...overrides,
    });

  it('matches the published path of a 200 yd zero to within an inch at 500 yd', () => {
    const rows = calculateTrajectory(federal())!.rows;
    const published = [2.1, 0, -8.9, -25.5, -51.5];
    expect(rows).toHaveLength(published.length);
    for (const [index, path] of published.entries()) {
      // The chart is printed to a tenth of an inch, so no comparison can be tighter than that.
      const allowed = Math.max(0.15, Math.abs(path) * 0.015);
      expect(Math.abs(-inches(rows[index]!.dropMeters) - path)).toBeLessThanOrEqual(allowed);
    }
  });

  it('matches the published remaining velocity, and reads its energy column in both units', () => {
    const result = calculateTrajectory(federal())!;
    const velocity = [2460, 2277, 2103, 1936, 1778];
    // The energy column of any chart is its velocity column in other units, so this is not a
    // second reading of the drag model: it is the grain to kilogram and joule to foot-pound
    // chain, checked against a printed figure rather than against itself.
    const energy = [2257, 1935, 1650, 1398, 1179];
    expect(result.rows).toHaveLength(velocity.length);
    for (const [index, row] of result.rows.entries()) {
      const expectedSpeed = velocity[index]!;
      const expectedEnergy = energy[index]!;
      expect(Math.abs(feetPerSecond(row.speedMs) - expectedSpeed) / expectedSpeed).toBeLessThanOrEqual(0.01);
      expect(Math.abs(footPounds(row.energyJoules) - expectedEnergy) / expectedEnergy).toBeLessThanOrEqual(0.015);
    }
    expect(footPounds(result.muzzleEnergyJoules)).toBeCloseTo(2619, 0);
  });

  it('matches the published drift of a full value ten mile an hour wind', () => {
    const rows = calculateTrajectory(
      federal({ wind: { speed: 10, unit: 'mph', preset: '9', customFromDegrees: 270 } }),
    )!.rows;
    const published = [0.7, 3.1, 7.4, 13.4, 22.0];
    expect(rows).toHaveLength(published.length);
    for (const [index, drift] of published.entries()) {
      // Wind is the loosest column in any chart: the maker does not say which hour it blew from.
      expect(Math.abs(inches(rows[index]!.driftMeters) - drift)).toBeLessThanOrEqual(Math.max(0.12, drift * 0.04));
    }
    // A wind from nine o'clock pushes the bullet right, which is the side the hold comes off.
    expect(rows[4]!.driftMeters).toBeGreaterThan(0);
  });

  it('reads the same published table in metres and in inches alike', () => {
    // 200 yd and 300 yd entered as metres must still give the published 8.9 inch drop at 300 yd.
    const metric = calculateTrajectory(
      federal({
        distanceUnit: 'm',
        zeroDistance: toMeters(200, 'yd'),
        step: toMeters(300, 'yd'),
        maxRange: toMeters(300, 'yd'),
        dropUnit: 'cm',
      }),
    )!;
    expect(metric.rows).toHaveLength(1);
    expect(inches(metric.rows[0]!.dropMeters)).toBeCloseTo(8.89, 1);
    expect(metric.rows[0]!.dropMeters * 100).toBeCloseTo(22.6, 1);
  });

  // Norma Diamond Line Match 308 Win 10.9 g (168 gr): 777 m/s, G1 BC 0.462, 40 mm sight
  // height, from norma-ammunition.com (2026-09-22). This one is published in metric.
  const norma = () => input({ muzzleSpeed: { value: 777, unit: 'mps' }, maxRange: 600 });

  it('matches a published metric table of remaining velocity and energy', () => {
    const rows = calculateTrajectory(norma())!.rows;
    const velocity = [715, 656, 600, 543, 493, 447];
    expect(rows).toHaveLength(velocity.length);
    for (const [index, speed] of velocity.entries()) {
      expect(Math.abs(rows[index]!.speedMs - speed) / speed).toBeLessThanOrEqual(0.01);
    }
    // The published energies at 400, 500 and 600 m, to within a few joules.
    expect(rows[3]!.energyJoules).toBeCloseTo(1609, -1);
    expect(rows[4]!.energyJoules).toBeCloseTo(1325, -1);
    expect(rows[5]!.energyJoules).toBeCloseTo(1089, -1);
  });
});

describe('the integration itself', () => {
  /** Air thin enough that drag cannot register, so the closed form parabola has to come back out. */
  const vacuum = () =>
    input({
      ballisticCoefficient: 2,
      atmosphere: { ...standardAir, pressure: { value: 0.0001, unit: 'hpa' } },
    });

  it('reproduces the parabola of free flight when there is no air to slow the bullet', () => {
    const result = calculateTrajectory(vacuum())!;
    const angle = result.zeroAngleRadians;
    const speed = result.muzzleSpeedMs;
    for (const row of result.rows) {
      const distance = row.distanceMeters;
      // y = −h + x·tanθ − gx²/(2v²cos²θ), measured from the line of sight.
      const height =
        -0.04 +
        distance * Math.tan(angle) -
        (STANDARD_GRAVITY * distance ** 2) / (2 * speed ** 2 * Math.cos(angle) ** 2);
      expect(Math.abs(-row.dropMeters - height)).toBeLessThan(0.0002);
    }
  });

  it('drops exactly one free fall below the bore line while there is no drag', () => {
    const result = calculateTrajectory(vacuum())!;
    const angle = result.zeroAngleRadians;
    for (const row of result.rows) {
      // The bore line leaves the muzzle at the departure angle; the gap down to the bullet is ½gt².
      const boreLine = -0.04 + row.distanceMeters * Math.tan(angle);
      expect(boreLine + row.dropMeters).toBeCloseTo(0.5 * STANDARD_GRAVITY * row.timeSeconds ** 2, 4);
      // With no drag the time of flight is the distance over a forward speed that never changes.
      expect(row.timeSeconds).toBeCloseTo(row.distanceMeters / (result.muzzleSpeedMs * Math.cos(angle)), 5);
    }
  });

  it('has already converged at the step it ships with', () => {
    const coarse = calculateTrajectory(input({ maxRange: 1000, step: 1000 }))!;
    const fine = calculateTrajectory(input({ maxRange: 1000, step: 1000, timeStepSeconds: 0.0001 }))!;
    expect(coarse.rows.length).toBeGreaterThan(0);
    expect(fine.rows.length).toBeGreaterThan(0);
    const coarseRow = coarse.rows[0]!;
    const fineRow = fine.rows[0]!;
    // A fifth of the step moves the drop at 1000 m by well under a hundredth of a millimetre.
    expect(Math.abs(coarseRow.dropMeters - fineRow.dropMeters) * 1000).toBeLessThan(0.01);
    expect(Math.abs(coarseRow.timeSeconds - fineRow.timeSeconds)).toBeLessThan(0.00001);
  });

  it('refuses a step the integration could never finish on', () => {
    // A step of zero leaves the state where it was, so the loop would run until the tab died.
    for (const timeStepSeconds of [0, -0.001, NaN, Number.POSITIVE_INFINITY, 1])
      expect(calculateTrajectory(input({ timeStepSeconds }))).toBeNull();
    // The limit itself is still answered, coarsely: it is a guard against a mistake, not advice.
    expect(calculateTrajectory(input({ timeStepSeconds: MAX_TIME_STEP_SECONDS }))).not.toBeNull();
  });

  it('tells a zero on the way up from one on the way down', () => {
    const far = calculateTrajectory(input({ step: 100, maxRange: 500 }))!;
    expect(far.zeroSide).toBe('falling');
    expect(far.farZeroMeters).toBeCloseTo(100, 1);
    expect(far.nearZeroMeters).toBeGreaterThan(0);
    expect(far.nearZeroMeters).toBeLessThan(100);
    // A close zero is the crossing on the way up; the bullet comes back down much further out.
    const near = calculateTrajectory(input({ zeroDistance: 25, step: 100, maxRange: 500 }))!;
    expect(near.zeroSide).toBe('rising');
    expect(near.nearZeroMeters).toBeCloseTo(25, 1);
    expect(near.farZeroMeters).toBeGreaterThan(150);
    expect(near.apex.distanceMeters).toBeGreaterThan(25);
    expect(near.apex.distanceMeters).toBeLessThan(near.farZeroMeters!);
  });

  it('lands on the line of sight at the zero, having crossed it once on the way up', () => {
    const result = calculateTrajectory(input({ step: 25, maxRange: 100 }))!;
    expect(result.rows.length).toBeGreaterThan(0);
    const atZero = result.rows[result.rows.length - 1]!;
    expect(atZero.distanceMeters).toBe(100);
    expect(Math.abs(atZero.dropMeters)).toBeLessThan(0.0002);
    expect(result.nearZeroMeters).toBeGreaterThan(0);
    expect(result.nearZeroMeters).toBeLessThan(100);
    // The bullet leaves a scope height low, so at 25 m it is still under the sight line.
    expect(result.rows[0]!.dropMeters).toBeGreaterThan(0);
    // The top of the arc sits past the near crossing.
    expect(result.apex.distanceMeters).toBeGreaterThan(result.nearZeroMeters!);
    expect(result.apex.heightMeters).toBeGreaterThan(0);
  });

  it('keeps losing speed and gaining drop the further the bullet goes', () => {
    const result = calculateTrajectory(input({ step: 50, maxRange: 600 }))!;
    for (let index = 1; index < result.rows.length; index += 1) {
      const row = result.rows[index]!;
      const previousRow = result.rows[index - 1]!;
      expect(row.speedMs).toBeLessThan(previousRow.speedMs);
      expect(row.energyJoules).toBeLessThan(previousRow.energyJoules);
      expect(row.timeSeconds).toBeGreaterThan(previousRow.timeSeconds);
      expect(row.dropMeters).toBeGreaterThan(previousRow.dropMeters);
    }
    // Every row's energy is ½mv² of that row's own remaining speed.
    for (const row of result.rows) {
      expect(row.energyJoules).toBeCloseTo(0.5 * result.massKg * row.speedMs ** 2, 8);
      // With still air the speed through it and the speed over the ground are the same number.
      expect(row.mach).toBeCloseTo(row.speedMs / result.conditions.speedOfSoundMs, 10);
    }
  });

  it('reports the drop as the angle it actually subtends', () => {
    const result = calculateTrajectory(input({ wind: { ...noWind, speed: 5 }, step: 250, maxRange: 500 }))!;
    for (const row of result.rows) {
      // The same tangent the sight adjustment tool uses, so a click there moves this drop here.
      expect(angularSizeMm(row.dropMoa * MOA_RADIANS, row.distanceMeters) / 1000).toBeCloseTo(row.dropMeters, 9);
      expect(angularSizeMm(row.driftMil * MIL_RADIANS, row.distanceMeters) / 1000).toBeCloseTo(row.driftMeters, 9);
      expect(row.dropMil).toBeCloseTo((row.dropMoa * MOA_RADIANS) / MIL_RADIANS, 9);
    }
  });
});

describe('air, wind and the drag model', () => {
  it('drops more in dense air and less up a mountain', () => {
    const at = (overrides: Partial<TrajectoryInput['atmosphere']>) =>
      calculateTrajectory(input({ step: 500, maxRange: 500, atmosphere: { ...standardAir, ...overrides } }))!;
    const firstDropMeters = (result: ReturnType<typeof at>) => {
      const row = result.rows[0];
      if (!row) throw new Error('Expected at least one trajectory row.');
      return row.dropMeters;
    };
    const standard = at({});
    const cold = at({ temperature: { value: -20, unit: 'c' } });
    const hot = at({ temperature: { value: 40, unit: 'c' } });
    const mountain = at({ source: 'altitude', altitude: { value: 3000, unit: 'm' } });
    expect(cold.conditions.densityKgPerM3).toBeGreaterThan(standard.conditions.densityKgPerM3);
    expect(firstDropMeters(cold)).toBeGreaterThan(firstDropMeters(standard));
    expect(firstDropMeters(hot)).toBeLessThan(firstDropMeters(standard));
    expect(mountain.conditions.densityRatio).toBeLessThan(0.8);
    expect(firstDropMeters(mountain)).toBeLessThan(firstDropMeters(standard));
    // The altitude reading replaces the pressure field rather than being applied on top of it.
    expect(mountain.conditions.pressurePa).toBeCloseTo(standardPressurePa(3000), 6);
    expect(standard.conditions.densityRatio).toBeCloseTo(1, 6);
  });

  it('tells a pressure read on the spot from one corrected to sea level', () => {
    const air = (source: TrajectoryInput['atmosphere']['source'], hpa: number, altitude: number) =>
      resolveConditions({
        source,
        temperature: { value: 15, unit: 'c' },
        pressure: { value: hpa, unit: 'hpa' },
        altitude: { value: altitude, unit: 'm' },
      })!;
    // A barometer at the firing point already carries the height, so the altitude never touches it.
    expect(air('station', 795, 2000).pressurePa).toBeCloseTo(79500, 6);
    expect(air('station', 795, 0).pressurePa).toBeCloseTo(79500, 6);
    // A sea level reading has to be carried back down through the height to mean anything.
    expect(air('sea-level', 1013.25, 2000).pressurePa).toBeCloseTo(standardPressurePa(2000), 6);
    expect(air('sea-level', 1013.25, 2000).pressurePa).toBeCloseTo(air('altitude', 1, 2000).pressurePa, 6);
    expect(air('sea-level', 1013.25, 2000).pressurePa).toBeLessThan(101325);
    // Twenty hectopascals of high pressure at sea level are still twenty up the mountain.
    expect(air('sea-level', 1033.25, 2000).pressurePa).toBeGreaterThan(air('sea-level', 1013.25, 2000).pressurePa);
    // The altitude on its own cannot know the day, so the reading beside it changes nothing.
    expect(air('altitude', 900, 2000).pressurePa).toBeCloseTo(air('altitude', 1100, 2000).pressurePa, 6);
  });

  it('reads Mach at the speed through the air, not the speed over the ground', () => {
    const at = (preset: TrajectoryInput['wind']['preset']) =>
      calculateTrajectory(input({ step: 300, maxRange: 300, wind: { ...noWind, speed: 20, preset } }))!;
    const head = at('12');
    const headRow = head.rows[0]!;
    // Into a head wind the bullet meets the air faster than it crosses the ground, which is the
    // speed the drag function was read at and so the speed the Mach column has to show.
    const headAirspeed = headRow.mach * head.conditions.speedOfSoundMs;
    expect(headAirspeed).toBeGreaterThan(headRow.speedMs);
    expect(headAirspeed - headRow.speedMs).toBeCloseTo(20, 0);
    const tail = at('6');
    const tailRow = tail.rows[0]!;
    expect(tailRow.mach * tail.conditions.speedOfSoundMs).toBeLessThan(tailRow.speedMs);
  });

  it('blows the bullet away from the hour the wind comes from', () => {
    const at = (preset: TrajectoryInput['wind']['preset']) => {
      const row = calculateTrajectory(input({ step: 300, maxRange: 300, wind: { ...noWind, speed: 10, preset } }))!
        .rows[0];
      if (!row) throw new Error('Expected exactly one trajectory row.');
      return row;
    };
    // Named for where it comes from: from nine o'clock it pushes right, from three o'clock left.
    expect(at('9').driftMeters).toBeGreaterThan(0);
    expect(at('3').driftMeters).toBeCloseTo(-at('9').driftMeters, 6);
    // A wind straight down the range moves nothing sideways, but it does change the drop.
    expect(Math.abs(at('12').driftMeters)).toBeLessThan(1e-9);
    expect(Math.abs(at('6').driftMeters)).toBeLessThan(1e-9);
    expect(at('12').dropMeters).toBeGreaterThan(at('6').dropMeters);
    // Half value at the half hours, near enough the cosine of forty five degrees.
    expect(at('10:30').driftMeters / at('9').driftMeters).toBeCloseTo(Math.SQRT1_2, 1);
  });

  it('keeps a G7 bullet going further than a G1 bullet of the same coefficient', () => {
    const at = (dragModel: TrajectoryInput['dragModel'], ballisticCoefficient = 0.462) => {
      const row = calculateTrajectory(input({ dragModel, ballisticCoefficient, step: 600, maxRange: 600 }))!.rows[0];
      if (!row) throw new Error('Expected exactly one trajectory row.');
      return row;
    };
    expect(at('g7').speedMs).toBeGreaterThan(at('g1').speedMs);
    expect(at('g7').dropMeters).toBeLessThan(at('g1').dropMeters);
    // Halving the coefficient roughly doubles the drag, which is the rule for reading G7 against G1.
    expect(at('g7', 0.231).dropMeters).toBeLessThan(at('g1').dropMeters * 1.1);
    expect(at('g7', 0.231).dropMeters).toBeGreaterThan(at('g1').dropMeters * 0.9);
  });

  it('scales the drag with the ballistic coefficient the maker publishes', () => {
    const at = (ballisticCoefficient: number) => {
      const row = calculateTrajectory(input({ ballisticCoefficient, step: 400, maxRange: 400 }))!.rows[0];
      if (!row) throw new Error('Expected exactly one trajectory row.');
      return row;
    };
    expect(at(0.9).speedMs).toBeGreaterThan(at(0.462).speedMs);
    expect(at(0.2).dropMeters).toBeGreaterThan(at(0.462).dropMeters);
    // One pound per square inch is the sectional density of the one inch, one pound standard projectile.
    expect(BC_UNIT_KG_PER_SQUARE_METER).toBeCloseTo(0.45359237 / (MM_PER_INCH / 1000) ** 2, 8);
    expect(BC_UNIT_KG_PER_SQUARE_METER).toBeCloseTo(703.07, 2);
  });
});

describe('point blank range', () => {
  it('sights the rifle so the arc just fills the circle', () => {
    const result = calculateTrajectory(input({ vitalRadius: 5, dropUnit: 'cm' }))!;
    const pointBlank = result.pointBlank!;
    expect(result.pointBlankUnavailable).toBeNull();
    // The top of the arc reaches the top of the circle and is never allowed past it: a solve
    // that landed a hair over would have the bullet outside the circle at its own highest point.
    expect(pointBlank.apex.heightMeters).toBeLessThanOrEqual(0.05);
    expect(pointBlank.apex.heightMeters).toBeCloseTo(0.05, 4);
    expect(pointBlank.zeroMeters).toBeLessThan(pointBlank.rangeMeters);
    expect(pointBlank.apex.distanceMeters).toBeLessThan(pointBlank.zeroMeters);
    // Sighting in this far out is what the window costs, so it lands past the zero in the form.
    expect(pointBlank.zeroMeters).toBeGreaterThan(result.zeroDistanceMeters);
    // In still air nothing but drop can carry the bullet out, so both figures are the same.
    expect(pointBlank.windLimitedRangeMeters).toBeCloseTo(pointBlank.rangeMeters, 6);
  });

  it('measures the window as distance from the sight line, drift as well as drop', () => {
    const at = (speed: number, preset: TrajectoryInput['wind']['preset'] = '9') =>
      calculateTrajectory(input({ wind: { ...noWind, speed, preset } }))!.pointBlank!;
    const calm = at(0);
    // The sighting is worked out in still air either way, so the wind never moves the zero.
    expect(at(10).rangeMeters).toBeCloseTo(calm.rangeMeters, 3);
    expect(at(10).zeroMeters).toBeCloseTo(calm.zeroMeters, 3);
    // The window does move: a crosswind takes the bullet out of the circle sideways, and the
    // old check on drop alone would have gone on reporting the still air figure.
    expect(at(4).windLimitedRangeMeters!).toBeLessThan(calm.rangeMeters);
    expect(at(10).windLimitedRangeMeters!).toBeLessThan(at(4).windLimitedRangeMeters!);
    // A wind straight down the range has nothing to push sideways with, so it barely tells.
    expect(at(10, '12').windLimitedRangeMeters!).toBeGreaterThan(at(10).windLimitedRangeMeters! * 1.5);
  });

  it('has no point blank range at all when the sight sits outside the circle', () => {
    // A 2 cm circle cannot swallow a 40 mm scope height: the bullet leaves the muzzle below it,
    // and no sighting can lift it back, so naming a range would be naming one that is not there.
    const tight = calculateTrajectory(input({ vitalRadius: 2 }))!;
    expect(tight.pointBlank).toBeNull();
    expect(tight.pointBlankUnavailable).toBe('sight-above-radius');
    // Drop the sight into the circle and the range comes back.
    const low = calculateTrajectory(input({ vitalRadius: 2, sightHeight: { value: 15, unit: 'mm' } }))!;
    expect(low.pointBlankUnavailable).toBeNull();
    expect(low.pointBlank!.rangeMeters).toBeGreaterThan(low.pointBlank!.zeroMeters);
  });

  it('reaches further for a bigger circle and a faster bullet', () => {
    const wide = calculateTrajectory(input({ vitalRadius: 10 }))!.pointBlank!;
    const narrow = calculateTrajectory(input({ vitalRadius: 4.5 }))!.pointBlank!;
    expect(wide.rangeMeters).toBeGreaterThan(narrow.rangeMeters);
    const fast = calculateTrajectory(input({ muzzleSpeed: { value: 1000, unit: 'mps' } }))!.pointBlank!;
    const slow = calculateTrajectory(input({ muzzleSpeed: { value: 400, unit: 'mps' } }))!.pointBlank!;
    expect(fast.rangeMeters).toBeGreaterThan(slow.rangeMeters);
    // Reading the same circle in inches gives the same answer as reading it in centimetres.
    const inCentimetres = calculateTrajectory(input({ vitalRadius: 5.08, dropUnit: 'cm' }))!.pointBlank!;
    const inInches = calculateTrajectory(input({ vitalRadius: 2, dropUnit: 'inch' }))!.pointBlank!;
    expect(inInches.rangeMeters).toBeCloseTo(inCentimetres.rangeMeters, 2);
  });
});

describe('the table the tool prints', () => {
  it('steps out to the distance that was asked for', () => {
    const result = calculateTrajectory(input({ step: 50, maxRange: 300 }))!;
    expect(result.rows.map((row) => row.distanceMeters)).toEqual([50, 100, 150, 200, 250, 300]);
    expect(result.truncated).toBe(false);
  });

  it('steps in yards when the form is set to yards', () => {
    const result = calculateTrajectory(input({ distanceUnit: 'yd', step: 100, maxRange: 300 }))!;
    expect(result.rows.length).toBeGreaterThan(2);
    expect(result.rows[0]!.distanceMeters).toBeCloseTo(91.44, 6);
    expect(result.rows[2]!.distanceMeters).toBeCloseTo(274.32, 6);
  });

  it('stops at the row limit instead of printing a table nobody reads', () => {
    const result = calculateTrajectory(input({ step: 10, maxRange: 1000 }))!;
    expect(result.rows).toHaveLength(MAX_TABLE_ROWS);
    expect(result.truncated).toBe(true);
    expect(result.rows[MAX_TABLE_ROWS - 1]!.distanceMeters).toBe(400);
  });

  it('leaves out rows the bullet never reaches', () => {
    // A pellet this slow and this blunt runs out of forward speed long before a kilometre.
    const result = calculateTrajectory(
      input({
        muzzleSpeed: { value: 150, unit: 'mps' },
        mass: { value: 0.55, unit: 'g' },
        ballisticCoefficient: 0.02,
        zeroDistance: 25,
        step: 250,
        maxRange: 1000,
      }),
    )!;
    expect(result.reachedMeters).toBeLessThan(1000);
    expect(result.rows.length).toBeLessThan(4);
    expect(result.rows.every((row) => row.distanceMeters <= result.reachedMeters)).toBe(true);
  });

  it('returns nothing rather than a table built on an unusable number', () => {
    const broken: Partial<TrajectoryInput>[] = [
      { muzzleSpeed: { value: 0, unit: 'mps' } },
      { muzzleSpeed: { value: NaN, unit: 'mps' } },
      { mass: { value: -1, unit: 'g' } },
      { ballisticCoefficient: 0 },
      { ballisticCoefficient: NaN },
      { zeroDistance: 0 },
      { step: NaN },
      { maxRange: -100 },
      { vitalRadius: 0 },
      { sightHeight: { value: NaN, unit: 'mm' } },
      { wind: { ...noWind, speed: NaN } },
      { wind: { ...noWind, preset: 'custom', customFromDegrees: NaN } },
      { atmosphere: { ...standardAir, temperature: { value: -400, unit: 'c' } } },
      { atmosphere: { ...standardAir, pressure: { value: 0, unit: 'hpa' } } },
      { timeStepSeconds: 0 },
      { timeStepSeconds: -0.0005 },
      { timeStepSeconds: NaN },
    ];
    for (const overrides of broken) expect(calculateTrajectory(input(overrides))).toBeNull();
  });

  it('still answers for an air rifle, where the whole flight is subsonic', () => {
    const result = calculateTrajectory(
      input({
        muzzleSpeed: { value: 175, unit: 'mps' },
        mass: { value: 0.55, unit: 'g' },
        ballisticCoefficient: 0.025,
        zeroDistance: 25,
        step: 10,
        maxRange: 50,
        vitalRadius: 1.5,
      }),
    )!;
    expect(result.rows).toHaveLength(5);
    expect(result.rows.every((row) => row.mach < 1)).toBe(true);
    // About 8 J at the muzzle, the order a mid power air rifle is sold at.
    expect(result.muzzleEnergyJoules).toBeCloseTo(8.42, 2);
    // A scope 40 mm over the bore cannot be held dead on at a 1.5 cm circle at any distance,
    // because the pellet starts further below the sight line than the circle is wide.
    expect(result.pointBlank).toBeNull();
    expect(result.pointBlankUnavailable).toBe('sight-above-radius');
    // Open a circle wide enough to swallow the mount and the window appears.
    const wider = calculateTrajectory(
      input({
        muzzleSpeed: { value: 175, unit: 'mps' },
        mass: { value: 0.55, unit: 'g' },
        ballisticCoefficient: 0.025,
        zeroDistance: 25,
        step: 10,
        maxRange: 50,
        vitalRadius: 5,
      }),
    )!;
    expect(wider.pointBlank!.rangeMeters).toBeGreaterThan(wider.zeroDistanceMeters);
  });
});

describe('drop at distances of the caller\u2019s choosing', () => {
  const shot = (overrides: Partial<ShotDescription> = {}): ShotDescription => ({
    muzzleSpeed: { value: 800, unit: 'mps' },
    ballisticCoefficient: 0.462,
    dragModel: 'g1',
    sightHeight: { value: 40, unit: 'mm' },
    atmosphere: standardAir,
    ...overrides,
  });

  it('agrees with the table the trajectory tool prints, row for row', () => {
    // The two entry points share one integration, and this is what says so.
    const table = calculateTrajectory(input({ step: 100, maxRange: 400 }));
    const samples = dropsFromZero(shot(), 100, [100, 200, 300, 400]);
    expect(table).not.toBeNull();
    expect(samples).not.toBeNull();
    for (const [index, row] of (table?.rows ?? []).entries()) {
      expect(samples?.[index]?.dropMeters).toBeCloseTo(row.dropMeters, 12);
      expect(samples?.[index]?.speedMs).toBeCloseTo(row.speedMs, 12);
      expect(samples?.[index]?.timeSeconds).toBeCloseTo(row.timeSeconds, 12);
    }
  });

  it('puts the bullet on the line of sight at the distance it was sighted in at', () => {
    const [atZero] = dropsFromZero(shot(), 150, [150]) ?? [];
    expect(Math.abs(atZero?.dropMeters ?? 1)).toBeLessThan(0.0001);
  });

  it('answers in the order it was asked, whatever order that was', () => {
    const ascending = dropsFromZero(shot(), 100, [200, 300, 400]);
    const shuffled = dropsFromZero(shot(), 100, [400, 200, 300]);
    expect(shuffled?.[0]?.dropMeters).toBeCloseTo(ascending?.[2]?.dropMeters ?? 0, 12);
    expect(shuffled?.[1]?.dropMeters).toBeCloseTo(ascending?.[0]?.dropMeters ?? 0, 12);
    expect(shuffled?.[2]?.dropMeters).toBeCloseTo(ascending?.[1]?.dropMeters ?? 0, 12);
  });

  it('leaves an entry empty where the bullet never got that far', () => {
    // A pellet-like coefficient at a pellet-like speed stops well short of a kilometre.
    const samples = dropsFromZero(
      shot({ ballisticCoefficient: 0.02, muzzleSpeed: { value: 300, unit: 'mps' } }),
      30,
      [30, 3000],
    );
    expect(samples?.[0]).not.toBeNull();
    expect(samples?.[1]).toBeNull();
  });

  it('keeps the sight setting when the velocity changes, so the shots part company', () => {
    // The point of holding the angle: one rifle, one zero, rounds that leave at different speeds.
    const angle = departureAngle(shot(), 100);
    expect(angle).not.toBeNull();
    const slow = dropsAtAngle(shot({ muzzleSpeed: { value: 780, unit: 'mps' } }), angle ?? 0, [100, 300]);
    const fast = dropsAtAngle(shot({ muzzleSpeed: { value: 820, unit: 'mps' } }), angle ?? 0, [100, 300]);
    // Even at the zero distance they are not quite together, and by 300 m they are further apart.
    const near = Math.abs((slow?.[0]?.dropMeters ?? 0) - (fast?.[0]?.dropMeters ?? 0));
    const far = Math.abs((slow?.[1]?.dropMeters ?? 0) - (fast?.[1]?.dropMeters ?? 0));
    expect(near).toBeGreaterThan(0);
    expect(far).toBeGreaterThan(near);
    // The faster round is the one that is higher, at both distances.
    expect(fast?.[1]?.dropMeters ?? 0).toBeLessThan(slow?.[1]?.dropMeters ?? 0);
  });

  it('refuses a description that does not describe a shot', () => {
    expect(departureAngle(shot({ ballisticCoefficient: 0 }), 100)).toBeNull();
    expect(departureAngle(shot(), 0)).toBeNull();
    expect(dropsAtAngle(shot({ muzzleSpeed: { value: 0, unit: 'mps' } }), 0.001, [100])).toBeNull();
    expect(dropsAtAngle(shot(), Number.NaN, [100])).toBeNull();
    expect(dropsAtAngle(shot(), 0.001, [0])).toBeNull();
    expect(dropsAtAngle(shot(), 0.001, [])).toEqual([]);
  });

  it('refuses a time step that would never finish, or never move', () => {
    expect(dropsFromZero(shot({ timeStepSeconds: 0 }), 100, [100])).toBeNull();
    expect(dropsFromZero(shot({ timeStepSeconds: MAX_TIME_STEP_SECONDS * 2 }), 100, [100])).toBeNull();
  });
});
