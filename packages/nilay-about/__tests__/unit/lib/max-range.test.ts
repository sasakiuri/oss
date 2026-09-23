import { describe, expect, it } from 'vitest';

import {
  COARSE_ANGLE_MAX_DEGREES,
  JOURNEE_YARDS_PER_INCH,
  MAX_TIME_STEP_SECONDS,
  STEP_TRAVEL_METERS,
  airAtHeight,
  bulletProjectile,
  calculateMaxRange,
  convertDiameter,
  convertHeight,
  convertMass,
  convertSpeed,
  findMaxRange,
  flyAtAngle,
  fromKilograms,
  journeeRangeMeters,
  rangeTable,
  sphereProjectile,
  type MaxRangeSettings,
  type Shot,
} from '@/lib/max-range';
import {
  ISA_LAPSE_RATE_K_PER_M,
  ISA_PRESSURE_EXPONENT,
  STANDARD_AIR_DENSITY,
  STANDARD_GRAVITY,
  STANDARD_PRESSURE_PA,
  STANDARD_TEMPERATURE_CELSIUS,
  airDensity,
  standardPressurePa,
  toKelvin,
  toKilograms,
} from '@/lib/trajectory';

const standardAir = { temperatureK: toKelvin(STANDARD_TEMPERATURE_CELSIUS, 'c'), pressurePa: STANDARD_PRESSURE_PA };
const METERS_PER_FOOT = 0.3048;
const fps = (value: number) => value * METERS_PER_FOOT;
const inches = (value: number) => value * 0.0254;

/** A vacuum shot has a closed form, and it is the only exact answer available to check against. */
function parabola(speedMs: number, angleDegrees: number, heightMeters: number) {
  const radians = (angleDegrees * Math.PI) / 180;
  const up = speedMs * Math.sin(radians);
  const along = speedMs * Math.cos(radians);
  const seconds = (up + Math.sqrt(up * up + 2 * STANDARD_GRAVITY * heightMeters)) / STANDARD_GRAVITY;
  return {
    rangeMeters: along * seconds,
    flightSeconds: seconds,
    apexMeters: heightMeters + (up * up) / (2 * STANDARD_GRAVITY),
  };
}

const vacuumShot = (speedMs: number, heightMeters: number): Shot => ({
  // A vacuum shot never reads the projectile, but the field is not optional, so it carries one.
  projectile: { massKg: 0.01, dragFactor: 0, drag: () => 0 },
  muzzleSpeedMs: speedMs,
  launchHeightMeters: heightMeters,
  air: standardAir,
  vacuum: true,
  step: { travelMeters: 0.2, maxSecondsPerStep: 0.005 },
});

describe('the air above the firing point', () => {
  /**
   * The restated lapse rate and exponent are the ones ./trajectory keeps private. Asking
   * both files for the same air is what pins them: if either number is ever changed on one
   * side alone, the two atmospheres part company here.
   */
  it('reproduces the standard atmosphere of the trajectory tool when it starts at sea level', () => {
    for (const height of [0, 100, 500, 1000, 3000, 6000]) {
      const here = airAtHeight(standardAir, height);
      expect(here.pressurePa).toBeCloseTo(standardPressurePa(height), 6);
    }
  });

  it('carries the day it was given upwards rather than the standard day', () => {
    const coldMorning = { temperatureK: toKelvin(-5, 'c'), pressurePa: STANDARD_PRESSURE_PA };
    expect(airAtHeight(coldMorning, 0).temperatureK).toBeCloseTo(toKelvin(-5, 'c'), 9);
    // Twenty degrees colder at the muzzle is still colder a kilometre up, and denser with it.
    expect(airAtHeight(coldMorning, 1000).temperatureK).toBeLessThan(airAtHeight(standardAir, 1000).temperatureK);
    expect(airAtHeight(coldMorning, 1000).densityKgPerM3).toBeGreaterThan(
      airAtHeight(standardAir, 1000).densityKgPerM3,
    );
  });

  it('thins with height, which is why a shot carries further from a mountain', () => {
    expect(airAtHeight(standardAir, 0).densityKgPerM3).toBeCloseTo(STANDARD_AIR_DENSITY, 9);
    expect(airAtHeight(standardAir, 2000).densityKgPerM3).toBeLessThan(airAtHeight(standardAir, 0).densityKgPerM3);
    expect(airAtHeight(standardAir, 2000).speedOfSoundMs).toBeLessThan(airAtHeight(standardAir, 0).speedOfSoundMs);
    expect(airAtHeight(standardAir, 2000).densityKgPerM3).toBeCloseTo(
      airDensity(
        standardPressurePa(2000),
        toKelvin(STANDARD_TEMPERATURE_CELSIUS, 'c') - ISA_LAPSE_RATE_K_PER_M * 1999.4,
      ),
      3,
    );
    // The exponent is the one the barometric formula is written with; a wrong one would
    // show up as the wrong pressure above, but this keeps the value itself in the test.
    expect(ISA_PRESSURE_EXPONENT).toBeCloseTo(5.255877, 6);
  });
});

describe('a shot fired in a vacuum', () => {
  it('follows the parabola the closed form gives, from the ground', () => {
    for (const angle of [15, 30, 45, 60, 75]) {
      const flight = flyAtAngle(vacuumShot(300, 0), angle);
      const exact = parabola(300, angle, 0);
      expect(flight).not.toBeNull();
      if (flight === null) continue;
      expect(flight.rangeMeters).toBeCloseTo(exact.rangeMeters, 3);
      expect(flight.flightSeconds).toBeCloseTo(exact.flightSeconds, 5);
      expect(flight.apexMeters).toBeCloseTo(exact.apexMeters, 2);
    }
  });

  it('follows it from a muzzle above the ground as well', () => {
    const flight = flyAtAngle(vacuumShot(300, 30), 20);
    const exact = parabola(300, 20, 30);
    expect(flight).not.toBeNull();
    if (flight === null) return;
    expect(flight.rangeMeters).toBeCloseTo(exact.rangeMeters, 3);
    expect(flight.flightSeconds).toBeCloseTo(exact.flightSeconds, 5);
    expect(flight.apexMeters).toBeCloseTo(exact.apexMeters, 2);
  });

  it('comes down at the speed it left at, and at the angle it left at', () => {
    const flight = flyAtAngle(vacuumShot(300, 0), 35);
    expect(flight).not.toBeNull();
    if (flight === null) return;
    expect(flight.impactSpeedMs).toBeCloseTo(300, 4);
    expect(flight.impactAngleDegrees).toBeCloseTo(35, 4);
    // Half the mass times the square of the speed, the whole of it still there.
    expect(flight.impactEnergyJoules).toBeCloseTo(0.5 * 0.01 * 300 ** 2, 2);
  });

  it('carries furthest at forty-five degrees when there is no air to pay for the climb', () => {
    const found = findMaxRange(vacuumShot(300, 0));
    expect(found).not.toBeNull();
    if (found === null) return;
    expect(found.angleDegrees).toBeCloseTo(45, 1);
    expect(found.flight.rangeMeters).toBeCloseTo(300 ** 2 / STANDARD_GRAVITY, 1);
  });
});

describe('a shot fired through air', () => {
  const bullet = bulletProjectile({ ballisticCoefficient: 0.2, dragModel: 'g7', massKg: toKilograms(147, 'grain') });
  const rifleShot = (): Shot => {
    if (bullet === null) throw new Error('the bullet is described well enough to fly');
    return { projectile: bullet, muzzleSpeedMs: fps(2750), launchHeightMeters: 1.5, air: standardAir };
  };

  it('carries furthest below forty-five degrees, because the climb is paid for twice', () => {
    const found = findMaxRange(rifleShot());
    expect(found).not.toBeNull();
    if (found === null) return;
    expect(found.angleDegrees).toBeGreaterThan(20);
    expect(found.angleDegrees).toBeLessThan(45);
  });

  it('agrees with a fine sweep over every angle, so the search has not settled on a false peak', () => {
    const shot = rifleShot();
    const found = findMaxRange(shot);
    expect(found).not.toBeNull();
    if (found === null) return;
    let sweptBest = 0;
    for (let angle = 1; angle <= COARSE_ANGLE_MAX_DEGREES; angle += 1) {
      const flight = flyAtAngle(shot, angle);
      if (flight !== null && flight.rangeMeters > sweptBest) sweptBest = flight.rangeMeters;
    }
    expect(found.flight.rangeMeters).toBeGreaterThanOrEqual(sweptBest);
    expect(found.flight.rangeMeters / sweptBest).toBeLessThan(1.01);
  });

  it('does not move when the steps are halved, so the integration has converged', () => {
    const coarse = findMaxRange(rifleShot());
    const fine = findMaxRange({
      ...rifleShot(),
      step: { travelMeters: STEP_TRAVEL_METERS / 2, maxSecondsPerStep: MAX_TIME_STEP_SECONDS / 2 },
    });
    expect(coarse).not.toBeNull();
    expect(fine).not.toBeNull();
    if (coarse === null || fine === null) return;
    const difference = Math.abs(coarse.flight.rangeMeters - fine.flight.rangeMeters) / fine.flight.rangeMeters;
    expect(difference).toBeLessThan(0.001);
  });

  it('carries further from a faster muzzle and from a higher one', () => {
    const slower = flyAtAngle({ ...rifleShot(), muzzleSpeedMs: fps(2200) }, 30);
    const faster = flyAtAngle(rifleShot(), 30);
    expect(slower).not.toBeNull();
    expect(faster).not.toBeNull();
    if (slower === null || faster === null) return;
    expect(faster.rangeMeters).toBeGreaterThan(slower.rangeMeters);

    const low = flyAtAngle({ ...rifleShot(), launchHeightMeters: 0 }, 0);
    const high = flyAtAngle({ ...rifleShot(), launchHeightMeters: 10 }, 0);
    expect(low).not.toBeNull();
    expect(high).not.toBeNull();
    if (low === null || high === null) return;
    expect(high.rangeMeters).toBeGreaterThan(low.rangeMeters);
  });

  it('carries further through thin air than through dense air', () => {
    const thin = flyAtAngle({ ...rifleShot(), air: { ...standardAir, pressurePa: STANDARD_PRESSURE_PA * 0.7 } }, 30);
    const dense = flyAtAngle(rifleShot(), 30);
    expect(thin).not.toBeNull();
    expect(dense).not.toBeNull();
    if (thin === null || dense === null) return;
    expect(thin.rangeMeters).toBeGreaterThan(dense.rangeMeters);
  });

  it('falls a long way short of the vacuum parabola', () => {
    const withAir = flyAtAngle(rifleShot(), 30);
    const exact = parabola(fps(2750), 30, 1.5);
    expect(withAir).not.toBeNull();
    if (withAir === null) return;
    expect(withAir.rangeMeters).toBeLessThan(exact.rangeMeters / 10);
  });
});

/**
 * The published figures the model is put against. None of them is used in the calculation:
 * they are independent answers to the same question, and the point of the test is that the
 * integration reaches them without having been told them.
 */
describe('against published figures', () => {
  it('matches the shotshell calculation NRA Range Services publishes for #7 1/2 lead', () => {
    // "Shotshell Ballistics For 7 1/2, 8, & 9 Shot": 0.095 in lead of 7% antimony
    // (0.4046 lb/in3, 11 199 kg/m3) at 1200 fps, 59 F and 29.53 inHg. Its iterative
    // solution peaks at 668 feet between 23 and 24 degrees, coming down near 73 ft/s.
    const pellet = sphereProjectile({ diameterMeters: inches(0.095), densityKgPerM3: 11199 });
    expect(pellet).not.toBeNull();
    if (pellet === null) return;
    const found = findMaxRange({
      projectile: pellet,
      muzzleSpeedMs: fps(1200),
      launchHeightMeters: 0,
      air: { temperatureK: toKelvin(59, 'f'), pressurePa: 29.53 * 3386.389 },
    });
    expect(found).not.toBeNull();
    if (found === null) return;
    const publishedMeters = 668 * METERS_PER_FOOT;
    // Within a tenth of the published distance, and at the published angle to within a degree.
    expect(Math.abs(found.flight.rangeMeters - publishedMeters) / publishedMeters).toBeLessThan(0.1);
    expect(found.angleDegrees).toBeGreaterThan(22);
    expect(found.angleDegrees).toBeLessThan(26);
    // The impact velocity is the terminal velocity of that pellet, which is the part of the
    // published run least affected by how the drag of a sphere was modelled.
    expect(found.flight.impactSpeedMs).toBeGreaterThan(fps(65));
    expect(found.flight.impactSpeedMs).toBeLessThan(fps(80));
  });

  it("comes out near Journee's rule for a lead pellet, which is a different kind of answer", () => {
    const diameter = inches(0.095);
    const pellet = sphereProjectile({ diameterMeters: diameter, densityKgPerM3: 11199 });
    expect(pellet).not.toBeNull();
    if (pellet === null) return;
    const found = findMaxRange({
      projectile: pellet,
      muzzleSpeedMs: fps(1200),
      launchHeightMeters: 0,
      air: standardAir,
    });
    expect(found).not.toBeNull();
    if (found === null) return;
    const rule = journeeRangeMeters(diameter);
    expect(Math.abs(found.flight.rangeMeters - rule) / rule).toBeLessThan(0.1);
  });

  it('reaches the order of the range safety distance published for a 7.62 mm ball round', () => {
    // DA PAM 385-63 (16 April 2014), table 4-12, lists 4,100 m for 7.62mm M59/M80 ball.
    // That distance allows for ricochet as well as free flight, so the free flight figure
    // here has no business exceeding it by much, and no business falling far short either.
    const bullet = bulletProjectile({ ballisticCoefficient: 0.2, dragModel: 'g7', massKg: toKilograms(147, 'grain') });
    expect(bullet).not.toBeNull();
    if (bullet === null) return;
    const found = findMaxRange({
      projectile: bullet,
      muzzleSpeedMs: fps(2750),
      launchHeightMeters: 1.5,
      air: standardAir,
    });
    expect(found).not.toBeNull();
    if (found === null) return;
    expect(found.flight.rangeMeters).toBeGreaterThan(3300);
    expect(found.flight.rangeMeters).toBeLessThan(4500);
  });

  it("states Journee's rule as published: 2200 yards per inch of diameter", () => {
    // A #6 pellet of 0.11 inch comes to 242 yards, the worked example the rule is quoted with.
    expect(journeeRangeMeters(inches(0.11))).toBeCloseTo(242 * 0.9144, 6);
    expect(journeeRangeMeters(inches(1)) / 0.9144).toBeCloseTo(JOURNEE_YARDS_PER_INCH, 6);
    expect(journeeRangeMeters(0)).toBeNaN();
    expect(journeeRangeMeters(NaN)).toBeNaN();
  });
});

describe('describing the projectile', () => {
  it('reaches the same drag factor whether a sphere is described as a sphere or by its coefficient', () => {
    // A ballistic coefficient is mass over diameter squared, in pounds per square inch. For
    // a sphere both are known, so the two descriptions have to meet in the same number.
    const diameterMeters = inches(0.5);
    const densityKgPerM3 = 11340;
    const sphere = sphereProjectile({ diameterMeters, densityKgPerM3 });
    expect(sphere).not.toBeNull();
    if (sphere === null) return;
    const coefficient = sphere.massKg / 0.45359237 / 0.5 ** 2;
    const asBullet = bulletProjectile({
      ballisticCoefficient: coefficient,
      dragModel: 'g1',
      massKg: sphere.massKg,
    });
    expect(asBullet).not.toBeNull();
    if (asBullet === null) return;
    expect(sphere.dragFactor).toBeCloseTo(asBullet.dragFactor, 9);
  });

  it('has nothing to fly when the description is incomplete', () => {
    expect(bulletProjectile({ ballisticCoefficient: 0, dragModel: 'g1', massKg: 0.01 })).toBeNull();
    expect(bulletProjectile({ ballisticCoefficient: 0.4, dragModel: 'g1', massKg: NaN })).toBeNull();
    expect(sphereProjectile({ diameterMeters: -0.002, densityKgPerM3: 11340 })).toBeNull();
    expect(sphereProjectile({ diameterMeters: 0.002, densityKgPerM3: 0 })).toBeNull();
  });
});

describe('input that cannot be flown', () => {
  const shot = (): Shot => {
    const pellet = sphereProjectile({ diameterMeters: 0.0024, densityKgPerM3: 11340 });
    if (pellet === null) throw new Error('the pellet is described well enough to fly');
    return { projectile: pellet, muzzleSpeedMs: 380, launchHeightMeters: 1.5, air: standardAir };
  };

  it('answers nothing rather than something for an angle outside the quarter circle', () => {
    expect(flyAtAngle(shot(), -1)).toBeNull();
    expect(flyAtAngle(shot(), 91)).toBeNull();
    expect(flyAtAngle(shot(), NaN)).toBeNull();
  });

  it('answers nothing for a speed, a height or an atmosphere that is not a number', () => {
    expect(flyAtAngle({ ...shot(), muzzleSpeedMs: 0 }, 30)).toBeNull();
    expect(flyAtAngle({ ...shot(), muzzleSpeedMs: NaN }, 30)).toBeNull();
    expect(flyAtAngle({ ...shot(), launchHeightMeters: -1 }, 30)).toBeNull();
    expect(flyAtAngle({ ...shot(), air: { temperatureK: 0, pressurePa: STANDARD_PRESSURE_PA } }, 30)).toBeNull();
    expect(flyAtAngle({ ...shot(), step: { travelMeters: 0 } }, 30)).toBeNull();
  });

  it('fires straight up without carrying anywhere', () => {
    const flight = flyAtAngle(shot(), 90);
    expect(flight).not.toBeNull();
    if (flight === null) return;
    expect(flight.rangeMeters).toBeCloseTo(0, 6);
    // It still comes down, and far slower than it went up.
    expect(flight.impactSpeedMs).toBeGreaterThan(0);
    expect(flight.impactSpeedMs).toBeLessThan(380);
    expect(flight.impactAngleDegrees).toBeCloseTo(90, 0);
  });

  it('gives a row for every angle it is asked about', () => {
    const rows = rangeTable(shot(), [0, 30, 91]);
    expect(rows).toHaveLength(3);
    expect(rows[0]?.flight).not.toBeNull();
    expect(rows[1]?.flight).not.toBeNull();
    expect(rows[2]?.flight).toBeNull();
  });
});

describe('reading the whole form', () => {
  const settings: MaxRangeSettings = {
    kind: 'sphere',
    bullet: { ballisticCoefficient: 0.2, dragModel: 'g7', mass: { value: 9.7, unit: 'g' } },
    sphere: { diameter: { value: 2.4, unit: 'mm' }, densityKgPerM3: 11340 },
    muzzleSpeed: { value: 380, unit: 'mps' },
    launchHeight: { value: 1.5, unit: 'm' },
    elevationDegrees: 30,
    distanceUnit: 'm',
    atmosphere: {
      source: 'station',
      temperature: { value: 15, unit: 'c' },
      pressure: { value: 1013.25, unit: 'hpa' },
      altitude: { value: 0, unit: 'm' },
    },
  };

  it('works out the pellet, the shot asked about and the furthest shot together', () => {
    const result = calculateMaxRange(settings);
    expect(result).not.toBeNull();
    if (result === null) return;
    expect(result.kind).toBe('sphere');
    // A 2.4 mm lead sphere weighs about 0.0821 g.
    expect(result.massKg * 1000).toBeCloseTo(0.0821, 3);
    expect(result.muzzleEnergyJoules).toBeCloseTo(0.5 * result.massKg * 380 ** 2, 9);
    expect(result.chosen?.rangeMeters).toBeGreaterThan(100);
    expect(result.maximum?.flight.rangeMeters).toBeGreaterThanOrEqual(result.chosen?.rangeMeters ?? 0);
    expect(result.journeeMeters).toBeCloseTo(journeeRangeMeters(0.0024), 9);
    expect(result.table).toHaveLength(8);
    expect(result.cautions).toEqual([]);
  });

  it('uses the bullet rather than the pellet once the other kind is chosen, and drops the rule of thumb', () => {
    const result = calculateMaxRange({ ...settings, kind: 'bullet', muzzleSpeed: { value: 800, unit: 'mps' } });
    expect(result).not.toBeNull();
    if (result === null) return;
    expect(result.massKg).toBeCloseTo(0.0097, 9);
    // Journee's rule is about lead spheres, so a bullet has no business carrying it.
    expect(result.journeeMeters).toBeNull();
    expect(result.maximum?.flight.rangeMeters).toBeGreaterThan(2000);
  });

  it('flies improbable input and says so rather than refusing it', () => {
    const result = calculateMaxRange({ ...settings, muzzleSpeed: { value: 5000, unit: 'mps' } });
    expect(result).not.toBeNull();
    if (result === null) return;
    expect(result.cautions).toEqual([{ key: 'muzzleSpeed', bound: 'above', limit: 1500 }]);
    expect(result.maximum).not.toBeNull();
  });

  it('has no answer while a field is still being typed', () => {
    expect(calculateMaxRange({ ...settings, muzzleSpeed: { value: NaN, unit: 'mps' } })).toBeNull();
    expect(calculateMaxRange({ ...settings, sphere: { ...settings.sphere, densityKgPerM3: NaN } })).toBeNull();
    expect(
      calculateMaxRange({
        ...settings,
        atmosphere: { ...settings.atmosphere, temperature: { value: NaN, unit: 'c' } },
      }),
    ).toBeNull();
  });
});

describe('reading a figure in another unit', () => {
  it('rewrites a number into the same quantity said differently', () => {
    expect(convertSpeed(380, 'mps', 'fps')).toBeCloseTo(1246.7, 1);
    expect(convertSpeed(convertSpeed(380, 'mps', 'fps'), 'fps', 'mps')).toBeCloseTo(380, 1);
    expect(convertMass(9.7, 'g', 'grain')).toBeCloseTo(149.7, 1);
    expect(convertDiameter(2.4, 'mm', 'inch')).toBeCloseTo(0.0945, 4);
    expect(convertHeight(1.5, 'm', 'ft')).toBeCloseTo(4.92, 2);
    expect(convertSpeed(380, 'mps', 'mps')).toBe(380);
  });

  it('leaves a half-typed number alone so it can go on being typed', () => {
    expect(convertSpeed(NaN, 'mps', 'fps')).toBeNaN();
    expect(convertMass(NaN, 'g', 'grain')).toBeNaN();
  });

  it('turns kilograms back into the unit they were read in', () => {
    expect(fromKilograms(toKilograms(150, 'grain'), 'grain')).toBeCloseTo(150, 9);
    expect(fromKilograms(toKilograms(9.7, 'g'), 'g')).toBeCloseTo(9.7, 9);
  });
});
