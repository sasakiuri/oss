/**
 * What one pellet of a shot charge carries, and how much of it is left downrange.
 *
 * A shot charge is a great many spheres fired at once. Each of them flies on its own - the
 * pattern is where they end up, which the pattern tool measures from a board - so what can
 * be calculated here is the flight of a single pellet, and how many of them the shell holds.
 *
 * The pellet is treated as a point with two degrees of freedom: drag along its velocity and
 * weight downwards, integrated the same way `./trajectory` integrates a bullet. It differs
 * in where the drag comes from. A bullet carries a ballistic coefficient its maker publishes
 * against a standard projectile; a sphere has no such coefficient and needs none, because
 * its drag coefficient, its frontal area and its mass all follow from one diameter and one
 * density. Those three come from `./sphere-drag`, whose own comment sets out the two limits
 * that come with them, both of which this tool has to repeat on screen.
 *
 * What is left out, because it needs data a shooter does not have to hand: the deformation
 * of a pellet as it is fired, the interference between pellets in flight, the length of the
 * shot string, pellets that are not truly round, and the effect of the choke and the wad.
 * Every one of those makes a real pattern worse than the arithmetic here, so a figure from
 * this tool is the best a pellet could do, not what a particular shell does.
 */

import type { PelletDiameterUnit, PelletLoad, ShotChargeUnit, SpeedUnit } from './schemas/shot-pellets';
import type { DistanceUnit } from './schemas/sight-adjustment';
import { MM_PER_INCH, toMeters } from './sight-adjustment';
import { sphereDragCoefficient, sphereFrontalAreaM2, sphereMassKg } from './sphere-drag';
import {
  GRAMS_PER_GRAIN,
  JOULES_PER_FOOT_POUND,
  KILOGRAMS_PER_POUND,
  MAX_TABLE_ROWS,
  METERS_PER_FOOT,
  STANDARD_GRAVITY,
  TIME_STEP_SECONDS,
  type Conditions,
} from './trajectory';

export { resolveConditions } from './trajectory';

export type {
  AtmosphereSetting,
  LoadId,
  PelletDiameterUnit,
  PelletLoad,
  ShotChargeUnit,
  ShotPelletsSettings,
  SpeedUnit,
} from './schemas/shot-pellets';

/** The avoirdupois ounce: a sixteenth of the pound that `./trajectory` defines exactly. */
export const KILOGRAMS_PER_OUNCE = KILOGRAMS_PER_POUND / 16;

/**
 * Average pellet diameter for an American Standard shot number, in inches.
 *
 * Source: SAAMI's glossary entry for SHOT SIZE (https://saami.org/glossary/shot-size/,
 * retrieved 2026-09-22), which defines a shot size as "A numerical or letter(s) designation
 * indicating the average diameter of a pellet" and gives the rule
 *
 *   Shot Size = (17 - Number Designation)/100
 *
 * in hundredths of an inch, worked through for No. 6 (0.11 inch) and No. 10 (0.07 inch).
 *
 * The entry states no range over which the rule holds and says nothing about buckshot or
 * about the tolerance a maker works to, so neither is offered here: the numbers in
 * SHOT_NUMBERS are only the ones the menu shows, and the rule above is what fills them in.
 * It is an average diameter rather than a specification, which is why the diameter itself
 * stays the field being edited and a number only writes a value into it.
 */
export function shotNumberDiameterInches(number: number): number {
  return (17 - number) / 100;
}

/** Birdshot numbers the menu offers. Every diameter shown is shotNumberDiameterInches of it. */
export const SHOT_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 7.5, 8, 9, 10] as const;

export type PelletMaterial = 'lead' | 'bismuth' | 'iron';

/**
 * Densities of the pure metals shot is made from, in grams per cubic centimetre.
 *
 * Source: the Royal Society of Chemistry's periodic table (https://periodic-table.rsc.org/,
 * retrieved 2026-09-22), element pages 82, 83 and 26, quoted as published.
 *
 * Shot is not the pure metal. Lead shot for hunting is hardened with antimony and comes out
 * a little lighter than lead; steel shot is a low carbon steel rather than pure iron; and
 * the tungsten shot sold for waterfowl is a composite whose density is set by its maker and
 * is not the density of tungsten, which is why no tungsten figure is offered here. These
 * are starting points for the field, not a claim about any particular shot.
 */
export const MATERIAL_DENSITIES: Record<PelletMaterial, number> = {
  lead: 11.3,
  bismuth: 9.79,
  iron: 7.87,
};

const GRAMS_PER_KILOGRAM = 1000;
const CUBIC_CENTIMETRES_PER_CUBIC_METRE = 1e6;

export function diameterToMeters(value: number, unit: PelletDiameterUnit): number {
  return unit === 'inch' ? (value * MM_PER_INCH) / 1000 : value / 1000;
}

export function diameterFromMeters(meters: number, unit: PelletDiameterUnit): number {
  return unit === 'inch' ? (meters * 1000) / MM_PER_INCH : meters * 1000;
}

export function chargeToKilograms(value: number, unit: ShotChargeUnit): number {
  return unit === 'oz' ? value * KILOGRAMS_PER_OUNCE : value / GRAMS_PER_KILOGRAM;
}

export function chargeFromKilograms(kilograms: number, unit: ShotChargeUnit): number {
  return unit === 'oz' ? kilograms / KILOGRAMS_PER_OUNCE : kilograms * GRAMS_PER_KILOGRAM;
}

export function speedToMetersPerSecond(value: number, unit: SpeedUnit): number {
  return unit === 'fps' ? value * METERS_PER_FOOT : value;
}

export function speedFromMetersPerSecond(metersPerSecond: number, unit: SpeedUnit): number {
  return unit === 'fps' ? metersPerSecond / METERS_PER_FOOT : metersPerSecond;
}

/** Grams per cubic centimetre, the unit densities are published in, into SI. */
export function densityToKgPerM3(gramsPerCubicCentimetre: number): number {
  return (gramsPerCubicCentimetre * CUBIC_CENTIMETRES_PER_CUBIC_METRE) / GRAMS_PER_KILOGRAM;
}

export function toFootPounds(joules: number): number {
  return joules / JOULES_PER_FOOT_POUND;
}

export function toGrains(kilograms: number): number {
  return (kilograms * GRAMS_PER_KILOGRAM) / GRAMS_PER_GRAIN;
}

/**
 * Decimals kept when a field is rewritten into another unit: a micrometre of pellet, a
 * hundredth of a gram of charge, a tenth of a metre per second. Fine enough that the
 * rewritten number stands for the same load, coarse enough to stay readable, which means
 * a unit changed and changed back can move the last digit by half a step.
 */
const DIAMETER_DECIMALS: Record<PelletDiameterUnit, number> = { mm: 3, inch: 4 };
const CHARGE_DECIMALS: Record<ShotChargeUnit, number> = { g: 2, oz: 4 };
const SPEED_DECIMALS: Record<SpeedUnit, number> = { mps: 1, fps: 0 };

function round(value: number, decimals: number): number {
  // A draft the reader is still typing can be NaN, and it has to survive a unit change as a draft.
  if (!Number.isFinite(value)) return value;
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
}

export function convertDiameter(value: number, from: PelletDiameterUnit, to: PelletDiameterUnit): number {
  return from === to ? value : round(diameterFromMeters(diameterToMeters(value, from), to), DIAMETER_DECIMALS[to]);
}

export function convertCharge(value: number, from: ShotChargeUnit, to: ShotChargeUnit): number {
  return from === to ? value : round(chargeFromKilograms(chargeToKilograms(value, from), to), CHARGE_DECIMALS[to]);
}

export function convertSpeed(value: number, from: SpeedUnit, to: SpeedUnit): number {
  return from === to
    ? value
    : round(speedFromMetersPerSecond(speedToMetersPerSecond(value, from), to), SPEED_DECIMALS[to]);
}

export type PelletCautionKey = 'diameter' | 'density' | 'shotCharge' | 'muzzleSpeed';

/**
 * The band each quantity stays inside before the tool stops calling the entry a shot load.
 * These bounds are editorial, not from any standard: the arithmetic holds for any positive
 * number, so a value outside the band is still calculated and only carries a warning. The
 * room is wide on purpose - the smallest birdshot to a round ball at one end, a light target
 * load to a magnum waterfowl load at the other - so only plainly mistyped input trips it.
 */
export const PLAUSIBLE_RANGES: Record<PelletCautionKey, { min: number; max: number }> = {
  /** Metres: No. 12 birdshot to a ball that fills a 12 bore. */
  diameter: { min: 0.001, max: 0.02 },
  /** kg/m³: lighter than any shot in use, to denser than the densest tungsten composite. */
  density: { min: 4000, max: 20000 },
  /** Kilograms of shot: a sub-gauge target load to the heaviest magnum. */
  shotCharge: { min: 0.005, max: 0.08 },
  /** Metres per second: nothing a shotgun fires sits outside this. */
  muzzleSpeed: { min: 100, max: 600 },
};

export interface PelletCaution {
  key: PelletCautionKey;
  bound: 'below' | 'above';
  /** The bound that was crossed, in SI, so the screen can show it in whichever unit is selected. */
  limit: number;
}

function collectCautions(values: Record<PelletCautionKey, number>): PelletCaution[] {
  return (Object.keys(PLAUSIBLE_RANGES) as PelletCautionKey[]).flatMap((key): PelletCaution[] => {
    const { min, max } = PLAUSIBLE_RANGES[key];
    if (values[key] < min) return [{ key, bound: 'below', limit: min }];
    if (values[key] > max) return [{ key, bound: 'above', limit: max }];
    return [];
  });
}

/** Everything the integration needs about one pellet, already in SI. */
interface Pellet {
  /** Frontal area over twice the mass: the constant part of the drag deceleration. */
  dragFactor: number;
}

interface State {
  t: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface Rates {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/**
 * Drag along the velocity, weight downwards.
 *
 * The deceleration is ½ρv²·Cd·A/m, which for a sphere needs no ballistic coefficient: the
 * area and the mass are those of the pellet itself, and Cd is read from the sphere table at
 * the pellet's Mach number. A pellet leaving a shotgun is transonic and slows through the
 * whole of the table's steep part within the first few tens of metres, which is why the
 * table is read at every step rather than held at one value.
 */
function rates(state: State, pellet: Pellet, conditions: Conditions): Rates {
  // Wind is not modelled: it moves a pattern bodily, which is a pattern measurement rather
  // than a pellet calculation, and guessing it would be worse than saying nothing.
  const speed = Math.hypot(state.vx, state.vy);
  const drag = sphereDragCoefficient(speed / conditions.speedOfSoundMs);
  const factor = pellet.dragFactor * conditions.densityKgPerM3 * drag * speed;
  return {
    x: state.vx,
    y: state.vy,
    vx: -factor * state.vx,
    vy: -factor * state.vy - STANDARD_GRAVITY,
  };
}

function shift(state: State, by: Rates, dt: number): State {
  return {
    t: state.t + dt,
    x: state.x + by.x * dt,
    y: state.y + by.y * dt,
    vx: state.vx + by.vx * dt,
    vy: state.vy + by.vy * dt,
  };
}

/** One fourth-order Runge-Kutta step, for the reason `./trajectory` sets out beside its own. */
function advance(state: State, pellet: Pellet, conditions: Conditions, dt: number): State {
  const a = rates(state, pellet, conditions);
  const b = rates(shift(state, a, dt / 2), pellet, conditions);
  const c = rates(shift(state, b, dt / 2), pellet, conditions);
  const d = rates(shift(state, c, dt), pellet, conditions);
  const sixth = dt / 6;
  return {
    t: state.t + dt,
    x: state.x + sixth * (a.x + 2 * b.x + 2 * c.x + d.x),
    y: state.y + sixth * (a.y + 2 * b.y + 2 * c.y + d.y),
    vx: state.vx + sixth * (a.vx + 2 * b.vx + 2 * c.vx + d.vx),
    vy: state.vy + sixth * (a.vy + 2 * b.vy + 2 * c.vy + d.vy),
  };
}

function blend(from: State, to: State, fraction: number): State {
  const mix = (a: number, b: number) => a + (b - a) * fraction;
  return {
    t: mix(from.t, to.t),
    x: mix(from.x, to.x),
    y: mix(from.y, to.y),
    vx: mix(from.vx, to.vx),
    vy: mix(from.vy, to.vy),
  };
}

/** A pellet is spent long before this; the cap only stops a mistyped load looping forever. */
const MAX_FLIGHT_SECONDS = 10;

export interface PelletRow {
  distanceMeters: number;
  speedMs: number;
  energyJoules: number;
  timeSeconds: number;
  /** How far gravity has taken the pellet below the line it left the muzzle on. */
  dropMeters: number;
}

export interface PelletFlightOptions {
  timeStepSeconds?: number;
}

/**
 * The pellet at each of the distances asked for, fired horizontally.
 *
 * The muzzle is the origin and the barrel points along x, so the drop is what gravity alone
 * has done over the time of flight. A shotgun is pointed at the bird rather than dialled to
 * a zero, so that is the figure a shooter can use: it is how far the swarm has fallen by the
 * time it arrives, not an error against a sighted-in line.
 */
export function flyPellet(
  {
    diameterMeters,
    densityKgPerM3,
    muzzleSpeedMs,
  }: { diameterMeters: number; densityKgPerM3: number; muzzleSpeedMs: number },
  conditions: Conditions,
  distancesMeters: readonly number[],
  { timeStepSeconds = TIME_STEP_SECONDS }: PelletFlightOptions = {},
): PelletRow[] | null {
  const massKg = sphereMassKg(diameterMeters, densityKgPerM3);
  const areaM2 = sphereFrontalAreaM2(diameterMeters);
  if (!Number.isFinite(massKg) || massKg <= 0 || !Number.isFinite(areaM2)) return null;
  if (!Number.isFinite(muzzleSpeedMs) || muzzleSpeedMs <= 0) return null;
  if (!Number.isFinite(timeStepSeconds) || timeStepSeconds <= 0) return null;
  const pellet: Pellet = { dragFactor: areaM2 / (2 * massKg) };

  const wanted = distancesMeters.filter((distance) => Number.isFinite(distance) && distance >= 0).sort((a, b) => a - b);
  const rows: PelletRow[] = [];
  const at = (state: State): PelletRow => ({
    distanceMeters: state.x,
    speedMs: Math.hypot(state.vx, state.vy),
    energyJoules: 0.5 * massKg * (state.vx ** 2 + state.vy ** 2),
    timeSeconds: state.t,
    dropMeters: -state.y,
  });

  let state: State = { t: 0, x: 0, y: 0, vx: muzzleSpeedMs, vy: 0 };
  let index = 0;
  // The muzzle itself is a row when it was asked for, and needs no step to reach.
  while (index < wanted.length && (wanted[index] ?? 0) <= 0) {
    rows.push(at(state));
    index += 1;
  }
  while (index < wanted.length && state.t < MAX_FLIGHT_SECONDS) {
    const next = advance(state, pellet, conditions, timeStepSeconds);
    // A pellet that has stopped moving downrange can never reach the distances that are left.
    if (!(next.x > state.x)) return rows;
    while (index < wanted.length && (wanted[index] ?? Infinity) <= next.x) {
      const target = wanted[index] ?? 0;
      const span = next.x - state.x;
      rows.push(at(blend(state, next, span === 0 ? 0 : (target - state.x) / span)));
      index += 1;
    }
    state = next;
  }
  return rows;
}

export interface PelletSummary {
  massKg: number;
  /** Shot charge over the weight of one pellet. A real shell holds a whole number of them. */
  count: number;
  muzzleEnergyJoules: number;
  rows: PelletRow[];
  /** The row at the distance the two loads are compared at, when it is inside the table. */
  reference: PelletRow | null;
  cautions: PelletCaution[];
}

/**
 * How close two distances have to be before they stand for the same row.
 *
 * Two kinds of slack have to fit inside it. The first is how a distance was arrived at: a
 * table distance is a step converted into metres and then multiplied up, while the
 * reference distance is converted on its own, so the same distance reached along the two
 * routes can differ in the last bits of a double. At 30 yd the two come out 3.6e-15 m
 * apart. The second is the interpolation: a row's distance is read off a straight line
 * between two integration steps, which lands it within a few parts in 10^15 of the
 * distance asked for, under a nanometre over a range a shotgun covers.
 *
 * A micrometre sits far above both and far below anything that could make two real rows
 * one: the closest two rows can ever be is a whole step of the table.
 */
const SAME_DISTANCE_METERS = 1e-6;

const isSameDistance = (a: number, b: number) => Math.abs(a - b) < SAME_DISTANCE_METERS;

/** The distances a table of this step and length covers, the muzzle excluded. */
export function tableDistances(stepMeters: number, maxRangeMeters: number): number[] {
  if (!Number.isFinite(stepMeters) || stepMeters <= 0) return [];
  if (!Number.isFinite(maxRangeMeters) || maxRangeMeters <= 0) return [];
  const count = Math.min(Math.floor(maxRangeMeters / stepMeters), MAX_TABLE_ROWS);
  return Array.from({ length: count }, (_, index) => (index + 1) * stepMeters);
}

export interface PelletUnits {
  diameterUnit: PelletDiameterUnit;
  shotChargeUnit: ShotChargeUnit;
  speedUnit: SpeedUnit;
  distanceUnit: DistanceUnit;
}

/**
 * One load worked through: the weight of a pellet, how many of them the shell holds, and
 * what one of them has left at each distance in the table.
 *
 * The count is the shot charge divided by the weight of one pellet. It is the count the
 * charge would hold if every pellet were a perfect sphere of the diameter and density
 * entered, which is the same assumption the flight is calculated under.
 */
export function summarisePellets(
  load: PelletLoad,
  units: PelletUnits,
  conditions: Conditions,
  { step, maxRange, referenceDistance }: { step: number; maxRange: number; referenceDistance: number },
): PelletSummary | null {
  const diameterMeters = diameterToMeters(load.diameter, units.diameterUnit);
  const densityKgPerM3 = densityToKgPerM3(load.density);
  const chargeKg = chargeToKilograms(load.shotCharge, units.shotChargeUnit);
  const muzzleSpeedMs = speedToMetersPerSecond(load.muzzleSpeed, units.speedUnit);
  const massKg = sphereMassKg(diameterMeters, densityKgPerM3);
  if (!Number.isFinite(massKg) || massKg <= 0) return null;
  if (!Number.isFinite(chargeKg) || chargeKg <= 0) return null;
  if (!Number.isFinite(muzzleSpeedMs) || muzzleSpeedMs <= 0) return null;

  const referenceMeters = toMeters(referenceDistance, units.distanceUnit);
  const distances = tableDistances(toMeters(step, units.distanceUnit), toMeters(maxRange, units.distanceUnit));
  const wantsReference = Number.isFinite(referenceMeters) && referenceMeters > 0;
  // A reference distance that lands on a table distance is the same row, not a second one,
  // so it is only added to what the flight is asked for when no table distance already is it.
  const onTable = wantsReference && distances.some((distance) => isSameDistance(distance, referenceMeters));
  const asked = wantsReference && !onTable ? [...distances, referenceMeters] : distances;
  const flown = flyPellet({ diameterMeters, densityKgPerM3, muzzleSpeedMs }, conditions, asked);
  if (flown === null) return null;
  const rows = flown.filter((row) => distances.some((distance) => isSameDistance(distance, row.distanceMeters)));
  // Matched the same way the rows were, so a reference on a table distance is that very row
  // rather than a second one that differs from it in the last bits of a double. A reference
  // distance the pellet never reaches has no row at all, and the screen says so.
  const reference = wantsReference
    ? (flown.find((row) => isSameDistance(row.distanceMeters, referenceMeters)) ?? null)
    : null;

  return {
    massKg,
    count: chargeKg / massKg,
    muzzleEnergyJoules: 0.5 * massKg * muzzleSpeedMs ** 2,
    rows,
    reference,
    cautions: collectCautions({
      diameter: diameterMeters,
      density: densityKgPerM3,
      shotCharge: chargeKg,
      muzzleSpeed: muzzleSpeedMs,
    }),
  };
}

export interface PelletComparison {
  /** B against A, signed: positive means B has more of it. */
  countPercent: number;
  massPercent: number;
  /** Energy of one pellet at the reference distance. Empty when either load never gets there. */
  referenceEnergyPercent: number | null;
}

export function comparePellets(a: PelletSummary | null, b: PelletSummary | null): PelletComparison | null {
  if (a === null || b === null || a.count <= 0 || a.massKg <= 0) return null;
  const referenceEnergy = a.reference !== null && b.reference !== null && a.reference.energyJoules > 0;
  return {
    countPercent: (b.count / a.count - 1) * 100,
    massPercent: (b.massKg / a.massKg - 1) * 100,
    referenceEnergyPercent:
      referenceEnergy && a.reference !== null && b.reference !== null
        ? (b.reference.energyJoules / a.reference.energyJoules - 1) * 100
        : null,
  };
}

export type { Conditions } from './trajectory';
