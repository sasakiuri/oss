import { describe, expect, it } from 'vitest';

import {
  comparePellets,
  convertCharge,
  convertDiameter,
  convertSpeed,
  densityToKgPerM3,
  equivalentPellet,
  flyPellet,
  KILOGRAMS_PER_OUNCE,
  MATERIAL_DENSITIES,
  resolveConditions,
  shotNumberDiameterInches,
  summarisePellets,
  tableDistances,
  type Conditions,
  type PelletLoad,
  type PelletUnits,
} from '@/lib/shot-pellets';
import { sphereMassKg } from '@/lib/sphere-drag';
import { MAX_TABLE_ROWS, STANDARD_GRAVITY } from '@/lib/trajectory';

const standardAtmosphere = {
  source: 'altitude',
  temperature: { value: 15, unit: 'c' },
  pressure: { value: 1013.25, unit: 'hpa' },
  altitude: { value: 0, unit: 'm' },
} as const;

const conditions = resolveConditions(standardAtmosphere) as Conditions;

/** The same air with the density taken out: drag vanishes and only gravity is left. */
const vacuum: Conditions = { ...conditions, densityKgPerM3: 0, densityRatio: 0 };

const units: PelletUnits = { diameterUnit: 'mm', shotChargeUnit: 'g', speedUnit: 'mps', distanceUnit: 'm' };

// No. 7.5 lead, 28 g at 400 m/s: an ordinary clay target load, in metric.
const load: PelletLoad = { diameter: 2.41, density: MATERIAL_DENSITIES.lead, shotCharge: 28, muzzleSpeed: 400 };
const table = { step: 10, maxRange: 50, referenceDistance: 35 };

describe('the shot number a pellet diameter is written against', () => {
  // The two examples SAAMI works through in the glossary entry the rule is quoted from.
  it('reproduces the published worked examples', () => {
    expect(shotNumberDiameterInches(6)).toBeCloseTo(0.11, 12);
    expect(shotNumberDiameterInches(10)).toBeCloseTo(0.07, 12);
  });

  it('gets smaller as the number gets larger, which is what the rule means', () => {
    expect(shotNumberDiameterInches(9)).toBeLessThan(shotNumberDiameterInches(7.5));
    expect(shotNumberDiameterInches(7.5)).toBeLessThan(shotNumberDiameterInches(4));
  });
});

describe('reading a load in another unit', () => {
  it('keeps the same pellet, charge and speed when the unit changes', () => {
    // 2.41 mm is 0.0949 inch; a tenth of a thousandth of an inch is below any shot tolerance.
    expect(convertDiameter(2.41, 'mm', 'inch')).toBeCloseTo(0.0949, 4);
    expect(convertDiameter(convertDiameter(2.41, 'mm', 'inch'), 'inch', 'mm')).toBeCloseTo(2.41, 3);
    // One ounce of shot is 28.35 g, the charge an American box prints as 1 oz.
    expect(convertCharge(1, 'oz', 'g')).toBeCloseTo(28.35, 2);
    expect(KILOGRAMS_PER_OUNCE * 16).toBeCloseTo(0.45359237, 12);
    expect(convertSpeed(400, 'mps', 'fps')).toBe(1312);
    expect(convertDiameter(2.41, 'mm', 'mm')).toBe(2.41);
  });

  it('leaves a half-typed number alone rather than turning it into a value', () => {
    expect(convertDiameter(NaN, 'mm', 'inch')).toBeNaN();
    expect(convertSpeed(NaN, 'mps', 'fps')).toBeNaN();
  });
});

describe('the weight of a pellet and how many of them a shell holds', () => {
  it('counts the charge in pellets of the diameter and density entered', () => {
    const summary = summarisePellets(load, units, conditions, table);
    expect(summary).not.toBeNull();
    // πd³/6 × 11 300 kg/m³ for a 2.41 mm sphere: 0.0828 g, which 28 g holds about 338 of.
    expect((summary?.massKg ?? 0) * 1000).toBeCloseTo(0.0828, 4);
    expect(summary?.count ?? 0).toBeCloseTo(28 / 0.0828, 0);
  });

  it('holds twice as many pellets when the charge is twice as heavy', () => {
    const light = summarisePellets(load, units, conditions, table);
    const heavy = summarisePellets({ ...load, shotCharge: 56 }, units, conditions, table);
    expect((heavy?.count ?? 0) / (light?.count ?? 1)).toBeCloseTo(2, 12);
    expect(heavy?.massKg).toBeCloseTo(light?.massKg ?? 0, 15);
  });

  it('holds fewer, lighter pellets when the same size is made of steel instead of lead', () => {
    const lead = summarisePellets(load, units, conditions, table);
    const steel = summarisePellets({ ...load, density: MATERIAL_DENSITIES.iron }, units, conditions, table);
    const ratio = MATERIAL_DENSITIES.iron / MATERIAL_DENSITIES.lead;
    expect((steel?.massKg ?? 0) / (lead?.massKg ?? 1)).toBeCloseTo(ratio, 12);
    // Lighter pellets means more of them in the same weight of shot.
    expect((steel?.count ?? 0) / (lead?.count ?? 1)).toBeCloseTo(1 / ratio, 12);
    const comparison = comparePellets(lead, steel);
    expect(comparison?.countPercent ?? 0).toBeGreaterThan(0);
    expect(comparison?.massPercent ?? 0).toBeLessThan(0);
    // Less weight behind the same frontal area: the steel pellet arrives with less energy.
    expect(comparison?.referenceEnergyPercent ?? 0).toBeLessThan(0);
  });

  it('weighs a pellet the same way the shared sphere helper does', () => {
    const summary = summarisePellets(load, units, conditions, table);
    expect(summary?.massKg).toBeCloseTo(sphereMassKg(0.00241, densityToKgPerM3(MATERIAL_DENSITIES.lead)), 15);
  });
});

describe('flying a pellet', () => {
  const pellet = { diameterMeters: 0.00241, densityKgPerM3: densityToKgPerM3(11.3), muzzleSpeedMs: 400 };

  it('falls under gravity alone and keeps its speed downrange when there is no air', () => {
    const rows = flyPellet(pellet, vacuum, [100]);
    const row = rows?.[0];
    // 100 m at 400 m/s is a quarter of a second, and ½gt² of that is 30.6 cm.
    expect(row?.timeSeconds).toBeCloseTo(0.25, 6);
    expect(row?.dropMeters).toBeCloseTo(0.5 * STANDARD_GRAVITY * 0.25 ** 2, 4);
    // Nothing has slowed the pellet downrange, so the whole of the speed it has gained is
    // the gt it has fallen at: the total is larger than the muzzle speed, not equal to it.
    expect(row?.speedMs).toBeCloseTo(Math.hypot(400, STANDARD_GRAVITY * 0.25), 5);
  });

  it('splits gravity along and across a barrel raised or lowered', () => {
    // In a vacuum, fired 30° up: x = u t - ½ g sin30 t², drop = ½ g cos30 t².
    const up = 30 * (Math.PI / 180);
    const [row] = flyPellet(pellet, vacuum, [100], { launchRadians: up })!;
    const g = STANDARD_GRAVITY;
    const t = (400 - Math.sqrt(400 ** 2 - 2 * g * Math.sin(up) * 100)) / (g * Math.sin(up));
    expect(row!.timeSeconds).toBeCloseTo(t, 6);
    expect(row!.dropMeters).toBeCloseTo(0.5 * g * Math.cos(up) * t ** 2, 4);
    // Straight up nothing pulls it off the line, and down a slope it arrives sooner than uphill.
    expect(flyPellet(pellet, vacuum, [100], { launchRadians: Math.PI / 2 })![0]!.dropMeters).toBeCloseTo(0, 12);
    const [down] = flyPellet(pellet, conditions, [100], { launchRadians: -up })!;
    const [rising] = flyPellet(pellet, conditions, [100], { launchRadians: up })!;
    expect(down!.timeSeconds).toBeLessThan(rising!.timeSeconds);
    expect(flyPellet(pellet, vacuum, [100], { launchRadians: 2 })).toBeNull();
  });

  it('sheds speed the whole way down the range once there is air to fly through', () => {
    const rows = flyPellet(pellet, conditions, [10, 20, 30, 40, 50]) ?? [];
    expect(rows).toHaveLength(5);
    for (const [index, row] of rows.entries()) {
      expect(row.speedMs).toBeLessThan(index === 0 ? 400 : (rows[index - 1]?.speedMs ?? 0));
      expect(row.timeSeconds).toBeGreaterThan(index === 0 ? 0 : (rows[index - 1]?.timeSeconds ?? 0));
      expect(row.dropMeters).toBeGreaterThan(index === 0 ? 0 : (rows[index - 1]?.dropMeters ?? 0));
    }
    // Air takes a real bite out of a small sphere: well under half the muzzle speed by 50 m.
    expect(rows[4]?.speedMs ?? 0).toBeLessThan(200);
    expect(rows[4]?.speedMs ?? 0).toBeGreaterThan(100);
    // Drag costs a pellet far more than gravity does over a shotgun's range.
    expect(rows[4]?.dropMeters ?? 0).toBeLessThan(1);
  });

  it('gives the same answer when the step is halved, so the step is not part of the answer', () => {
    const coarse = flyPellet(pellet, conditions, [40], { timeStepSeconds: 0.0005 })?.[0];
    const fine = flyPellet(pellet, conditions, [40], { timeStepSeconds: 0.00025 })?.[0];
    // Relative, because what matters is that halving the step moves nothing a reader could
    // see: a millionth of the speed and of the drop is far below the width of a pattern.
    expect(Math.abs((fine?.speedMs ?? 0) / (coarse?.speedMs ?? 1) - 1)).toBeLessThan(1e-6);
    expect(Math.abs((fine?.dropMeters ?? 0) / (coarse?.dropMeters ?? 1) - 1)).toBeLessThan(1e-6);
  });

  it('answers at the muzzle and asks nothing of the integration to do it', () => {
    const rows = flyPellet(pellet, conditions, [0]) ?? [];
    expect(rows[0]?.speedMs).toBe(400);
    expect(rows[0]?.timeSeconds).toBe(0);
    expect(rows[0]?.dropMeters).toBe(-0);
  });

  it('sorts the distances it was asked for and returns one row for each', () => {
    const rows = flyPellet(pellet, conditions, [30, 10, 20]) ?? [];
    expect(rows.map((row) => Math.round(row.distanceMeters))).toEqual([10, 20, 30]);
  });

  it('has nothing to fly when the pellet or the speed is not a positive number', () => {
    expect(flyPellet({ ...pellet, diameterMeters: 0 }, conditions, [10])).toBeNull();
    expect(flyPellet({ ...pellet, densityKgPerM3: NaN }, conditions, [10])).toBeNull();
    expect(flyPellet({ ...pellet, muzzleSpeedMs: -1 }, conditions, [10])).toBeNull();
    expect(flyPellet(pellet, conditions, [10], { timeStepSeconds: 0 })).toBeNull();
  });
});

describe('the table the tool lays out', () => {
  it('runs from one step to the last whole step inside the range', () => {
    expect(tableDistances(10, 50)).toEqual([10, 20, 30, 40, 50]);
    expect(tableDistances(10, 45)).toEqual([10, 20, 30, 40]);
  });

  it('stops at the row limit rather than growing without end, and refuses nonsense', () => {
    expect(tableDistances(1, 1000)).toHaveLength(MAX_TABLE_ROWS);
    expect(tableDistances(0, 50)).toEqual([]);
    expect(tableDistances(10, NaN)).toEqual([]);
  });

  it('keeps the reference distance as one row even when it lands on a table distance', () => {
    const onTable = summarisePellets(load, units, conditions, { ...table, referenceDistance: 30 });
    expect(onTable?.rows.filter((row) => Math.abs(row.distanceMeters - 30) < 1e-9)).toHaveLength(1);
    expect(onTable?.reference?.distanceMeters).toBeCloseTo(30, 9);
    // The reference is that very row, not a second one calculated alongside it.
    expect(onTable?.reference).toBe(onTable?.rows[2]);
  });

  it('keeps it one row in yards too, where the two routes to the distance do not agree exactly', () => {
    // 30 yd multiplied up through a 10 yd step lands 3.6e-15 m from 30 yd converted on its own,
    // so an exact comparison would put both in the table and print the distance twice.
    const yards = { ...units, distanceUnit: 'yd' as const };
    const summary = summarisePellets(load, yards, conditions, { step: 10, maxRange: 50, referenceDistance: 30 });
    expect(summary?.rows).toHaveLength(5);
    expect(new Set(summary?.rows.map((row) => row.distanceMeters)).size).toBe(5);
    expect(summary?.reference).toBe(summary?.rows[2]);
    // The reference distance in yards is the table's third row and no closer to any other.
    expect(summary?.reference?.distanceMeters).toBeCloseTo(27.432, 6);
  });

  it('still adds a row of its own for a reference distance between two table distances', () => {
    const summary = summarisePellets(load, units, conditions, { ...table, referenceDistance: 35 });
    expect(summary?.rows).toHaveLength(5);
    expect(summary?.rows.some((row) => Math.abs(row.distanceMeters - 35) < 1e-6)).toBe(false);
    expect(summary?.reference?.distanceMeters).toBeCloseTo(35, 9);
  });

  it('has no reference row for a distance outside the table', () => {
    const summary = summarisePellets(load, units, conditions, { ...table, referenceDistance: 35 });
    expect(summary?.reference?.distanceMeters).toBeCloseTo(35, 9);
    expect(summary?.rows.every((row) => row.distanceMeters <= 50)).toBe(true);
  });

  it('reads distances in yards when the table is set to them', () => {
    const inYards = summarisePellets(load, { ...units, distanceUnit: 'yd' }, conditions, table);
    const inMeters = summarisePellets(load, units, conditions, table);
    // The same numbers in yards are shorter distances, so more speed is left at the last row.
    const lastYards = inYards?.rows.at(-1)?.speedMs ?? 0;
    const lastMeters = inMeters?.rows.at(-1)?.speedMs ?? 0;
    expect(lastYards).toBeGreaterThan(lastMeters);
  });
});

describe('warning about a load that is not one', () => {
  it('still calculates, and names what fell outside the range of a shot load', () => {
    const summary = summarisePellets({ ...load, muzzleSpeed: 2000 }, units, conditions, table);
    expect(summary?.cautions.map((caution) => caution.key)).toEqual(['muzzleSpeed']);
    expect(summary?.cautions[0]?.bound).toBe('above');
    expect(summary?.count).toBeGreaterThan(0);
  });

  it('says nothing about an ordinary load', () => {
    expect(summarisePellets(load, units, conditions, table)?.cautions).toEqual([]);
  });

  it('has no answer at all when a field is still being typed', () => {
    expect(summarisePellets({ ...load, diameter: NaN }, units, conditions, table)).toBeNull();
    expect(summarisePellets({ ...load, shotCharge: 0 }, units, conditions, table)).toBeNull();
    expect(comparePellets(null, null)).toBeNull();
  });
});

describe('the non-lead pellet with the same energy', () => {
  // No. 4 lead (0.13 in) from 400 m/s, 32 g.
  const lead = { diameterMeters: 0.13 * 0.0254, densityKgPerM3: 11300, muzzleSpeedMs: 400, chargeKg: 0.032 };

  it('gives the same material and speed back as the same pellet', () => {
    const same = equivalentPellet(lead, { densityKgPerM3: 11300, muzzleSpeedMs: 400 }, 35, conditions)!;
    expect(same.diameterMeters).toBeCloseTo(lead.diameterMeters, 7);
    expect(same.nearestShotNumber).toBe(4);
  });

  it('needs a larger steel pellet and a smaller TSS one, each carrying the same energy', () => {
    const reference = flyPellet(lead, conditions, [35])![0]!;
    const steel = equivalentPellet(lead, { densityKgPerM3: 7870, muzzleSpeedMs: 400 }, 35, conditions)!;
    const tss = equivalentPellet(lead, { densityKgPerM3: 18000, muzzleSpeedMs: 400 }, 35, conditions)!;
    expect(steel.diameterMeters).toBeGreaterThan(lead.diameterMeters);
    expect(tss.diameterMeters).toBeLessThan(lead.diameterMeters);
    for (const pellet of [steel, tss]) expect(pellet.energyJoules).toBeCloseTo(reference.energyJoules, 6);
    // A heavier pellet means fewer of them in the same weight of charge, and the reverse.
    expect(steel.count).toBeLessThan(tss.count);
    expect(steel.count).toBeCloseTo(0.032 / steel.massKg, 9);
  });

  it('asks for less steel when the steel load is faster', () => {
    const slow = equivalentPellet(lead, { densityKgPerM3: 7870, muzzleSpeedMs: 400 }, 35, conditions)!;
    const fast = equivalentPellet(lead, { densityKgPerM3: 7870, muzzleSpeedMs: 450 }, 35, conditions)!;
    expect(fast.diameterMeters).toBeLessThan(slow.diameterMeters);
  });

  it('has no answer when nothing in the search range reaches the energy', () => {
    expect(equivalentPellet(lead, { densityKgPerM3: 100, muzzleSpeedMs: 400 }, 35, conditions)).toBeNull();
    expect(
      equivalentPellet({ ...lead, chargeKg: 0 }, { densityKgPerM3: 7870, muzzleSpeedMs: 400 }, 35, conditions),
    ).toBeNull();
  });
});
