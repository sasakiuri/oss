/**
 * How far a projectile can carry when it is fired at an angle: the question behind
 * "know what is beyond your target".
 *
 * The flat-fire model in ./trajectory answers what happens between the muzzle and the
 * game. It cannot answer this one. Flat fire assumes the path stays near the line of
 * departure and the air stays the air at the muzzle, and it stops following the shot
 * after thirty seconds; a shot let off at thirty degrees climbs through a kilometre of
 * thinning air and is still falling a minute and a half later. So the equations here are
 * written again for two dimensions, with the air changing as the projectile climbs.
 *
 * The model is still a point mass: drag along the velocity, weight downwards, nothing
 * else. Two things that follow from that have to reach the reader, because they decide
 * how the answer may be used.
 *
 * A real projectile does not hold its nose into the wind through a shot like this. Past
 * the top of a steep climb it is falling nose-high, or sideways, or tumbling, and a
 * bullet that presents its side has far more drag than one that presents its point. More
 * drag means less distance, so the figure here is the longer of the two: a projectile
 * that stayed perfectly pointed would reach it, and a real one falls short. That is the
 * safe direction to be wrong in, and it is the only claim this file makes about the
 * difference.
 *
 * Ricochet is not modelled at all, and that error runs the other way. A shot that skips
 * off water, frozen ground or a road leaves with much of its speed and is thrown out
 * again, and published danger areas say so: DA PAM 385-63 (16 April 2014) notes of its
 * surface danger zones that "Distance X is for firing elevations up to maximum range and
 * considers both free flight and ricochet trajectories", and its distances are longer
 * than free flight alone. Nothing computed here bounds a shot that can ricochet.
 */

import type {
  DiameterUnit,
  HeightUnit,
  MassUnit,
  MaxRangeSettings,
  ProjectileKind,
  SpeedUnit,
} from './schemas/max-range';
import { METERS_PER_YARD, MM_PER_INCH } from './sight-adjustment';
import { sphereDragCoefficient, sphereFrontalAreaM2, sphereMassKg } from './sphere-drag';
import {
  BC_UNIT_KG_PER_SQUARE_METER,
  GRAMS_PER_GRAIN,
  ISA_LAPSE_RATE_K_PER_M,
  ISA_PRESSURE_EXPONENT,
  JOULES_PER_FOOT_POUND,
  METERS_PER_FOOT,
  STANDARD_GRAVITY,
  airDensity,
  fromMetersPerSecond,
  geopotentialHeight,
  resolveConditions,
  speedOfSound,
  toKilograms,
  toMetersPerSecond,
  type DragModel,
} from './trajectory';
import { dragCoefficient } from './trajectory-drag';

export type {
  AtmosphereSetting,
  BulletSetting,
  DiameterUnit,
  DistanceUnit,
  DragModel,
  HeightUnit,
  MassUnit,
  MaxRangeSettings,
  ProjectileKind,
  SpeedUnit,
  SphereSetting,
} from './schemas/max-range';

/**
 * The lapse rate and the barometric exponent come from ./trajectory, which reads them from
 * the same ISO 2533 standard atmosphere. The exponent is g₀M/(RL): it belongs to the gas
 * and to gravity, not to the height the column is measured from, which is why the column
 * below can start at the firing point instead of at sea level. A test still asks this file
 * and that one for the same air and requires the same answer.
 */

/** The air at the firing point. Everything above it is worked out from these two readings. */
export interface AirColumn {
  temperatureK: number;
  pressurePa: number;
}

export interface AirAtHeight {
  temperatureK: number;
  pressurePa: number;
  densityKgPerM3: number;
  speedOfSoundMs: number;
}

/**
 * The air a height above the firing point, from the readings taken at it.
 *
 * The temperature falls at the standard lapse rate and the pressure follows it through the
 * barometric formula, which is the same standard atmosphere ./trajectory uses, only based
 * at the firing point rather than at sea level. It is the day's temperature that is
 * carried up, not the standard one, so a cold morning stays a cold morning all the way up.
 *
 * What it cannot know is the day's own lapse rate. A temperature inversion, a front, or
 * the heat over a valley in summer all depart from 6.5 K per kilometre, and no reading a
 * shooter takes at the muzzle would show it. Over the two or three kilometres a small arms
 * projectile climbs, the resulting error in density is small next to the error in assuming
 * the projectile never yaws.
 */
export function airAtHeight(column: AirColumn, heightMeters: number): AirAtHeight {
  const height = geopotentialHeight(heightMeters);
  const ratio = 1 - (ISA_LAPSE_RATE_K_PER_M * height) / column.temperatureK;
  // The troposphere runs out long before this, and so does any small arms trajectory. The
  // floor only keeps a runaway integration finite instead of raising a negative to a power.
  const safeRatio = ratio > 0.05 ? ratio : 0.05;
  const temperatureK = column.temperatureK * safeRatio;
  const pressurePa = column.pressurePa * safeRatio ** ISA_PRESSURE_EXPONENT;
  return {
    temperatureK,
    pressurePa,
    densityKgPerM3: airDensity(pressurePa, temperatureK),
    speedOfSoundMs: speedOfSound(temperatureK),
  };
}

/**
 * A projectile as the equations of motion see it: a weight, a size and a drag function.
 *
 * `dragFactor` is the reference area over twice the mass, in m² per kg. The drag
 * deceleration is that factor times the air density, the drag coefficient and the square
 * of the speed, whichever way the projectile was described. For a bullet the factor comes
 * from the ballistic coefficient, for a sphere from its own diameter and material, and
 * the two routes meet in the same number.
 */
export interface Projectile {
  massKg: number;
  dragFactor: number;
  drag: (mach: number) => number;
}

const isPositive = (value: number) => Number.isFinite(value) && value > 0;

/**
 * A bullet described the way its maker describes it: a ballistic coefficient against one
 * of the standard drag functions, and a weight.
 *
 * π/8 divided by the coefficient is the same reference area over twice the mass, because
 * the standard projectile of every drag function is one inch across and one pound in
 * weight. ./trajectory builds its own drag factor the same way from the same constant.
 */
export function bulletProjectile(input: {
  ballisticCoefficient: number;
  dragModel: DragModel;
  massKg: number;
}): Projectile | null {
  if (!isPositive(input.ballisticCoefficient) || !isPositive(input.massKg)) return null;
  return {
    massKg: input.massKg,
    dragFactor: Math.PI / 8 / (input.ballisticCoefficient * BC_UNIT_KG_PER_SQUARE_METER),
    drag: (mach) => dragCoefficient(input.dragModel, mach),
  };
}

/**
 * A sphere described by what it is: a diameter and the density of the metal.
 *
 * No ballistic coefficient enters. A shot pellet has no published coefficient of its own,
 * and the one quoted for a load is worked back out of a diameter and a density anyway. See
 * ./sphere-drag for where the drag coefficients come from and what using them for a pellet
 * assumes - the measured sphere is 9/16 of an inch across, several times a pellet, and the
 * drag of a sphere follows the Reynolds number as well as the Mach number.
 */
export function sphereProjectile(input: { diameterMeters: number; densityKgPerM3: number }): Projectile | null {
  const massKg = sphereMassKg(input.diameterMeters, input.densityKgPerM3);
  const areaM2 = sphereFrontalAreaM2(input.diameterMeters);
  if (!isPositive(massKg) || !isPositive(areaM2)) return null;
  return { massKg, dragFactor: areaM2 / (2 * massKg), drag: sphereDragCoefficient };
}

/**
 * How far the projectile is allowed to travel between one step and the next, and the
 * longest step whatever its speed.
 *
 * A step of fixed length in time would be wasted on the slow fall - most of the flight, in
 * air the projectile barely notices - and far too coarse through the first second, where
 * it sheds hundreds of metres per second and crosses the transonic rise of the drag curve.
 * Fixing the distance instead puts the steps where the answer is made: about a
 * millisecond at the muzzle of a rifle, fifty at the top of the fall.
 *
 * The defaults are set so that halving both moves a maximum range by less than a tenth of
 * a per cent, which a test checks rather than asserts. In practice there is far more room
 * than that: against a run at a twentieth of these steps, a rifle at maximum range moves
 * by millimetres in four kilometres. They are chosen to leave that margin while a search
 * over the angles still finishes in the tens of milliseconds, because the screen runs one
 * on every change to the form.
 */
export const STEP_TRAVEL_METERS = 2;
export const MAX_TIME_STEP_SECONDS = 0.1;

/** A projectile still in the air after this long has stopped being a small arms projectile. */
export const MAX_FLIGHT_SECONDS = 600;

export interface StepSetting {
  travelMeters?: number;
  maxSecondsPerStep?: number;
}

export interface Shot {
  projectile: Projectile;
  muzzleSpeedMs: number;
  /** Height of the muzzle above the ground the projectile comes down on. */
  launchHeightMeters: number;
  air: AirColumn;
  /**
   * Set to zero to fly the shot in a vacuum.
   *
   * It is not an option on the screen. It exists so the tests can put the integration
   * against the closed form of a parabola, which is the only exact answer available.
   */
  vacuum?: boolean;
  step?: StepSetting;
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

function rates(state: State, shot: Shot): Rates {
  const speed = Math.hypot(state.vx, state.vy);
  if (shot.vacuum === true) return { x: state.vx, y: state.vy, vx: 0, vy: -STANDARD_GRAVITY };
  const air = airAtHeight(shot.air, state.y);
  const drag = shot.projectile.drag(speed / air.speedOfSoundMs);
  const factor = shot.projectile.dragFactor * air.densityKgPerM3 * drag * speed;
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

/** One fourth-order Runge-Kutta step, as ./trajectory takes, and for the same reason. */
function advance(state: State, shot: Shot, dt: number): State {
  const a = rates(state, shot);
  const b = rates(shift(state, a, dt / 2), shot);
  const c = rates(shift(state, b, dt / 2), shot);
  const d = rates(shift(state, c, dt), shot);
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

export interface Flight {
  /** Ground distance from the muzzle to where the projectile comes back to ground level. */
  rangeMeters: number;
  flightSeconds: number;
  /** The highest the path reached above the ground, not above the muzzle. */
  apexMeters: number;
  impactSpeedMs: number;
  impactEnergyJoules: number;
  /** How steeply it came down, in degrees below the horizontal. */
  impactAngleDegrees: number;
}

const DEGREES_TO_RADIANS = Math.PI / 180;

function readFlight(state: State, shot: Shot, apexMeters: number): Flight {
  const impactSpeedMs = Math.hypot(state.vx, state.vy);
  return {
    rangeMeters: state.x,
    flightSeconds: state.t,
    apexMeters,
    impactSpeedMs,
    impactEnergyJoules: 0.5 * shot.projectile.massKg * impactSpeedMs ** 2,
    impactAngleDegrees: Math.atan2(-state.vy, state.vx) / DEGREES_TO_RADIANS,
  };
}

/**
 * Fire one shot at an angle above the horizontal and follow it back down to the ground.
 *
 * The ground is flat and level with the firing point. A shot over a valley carries further
 * and one into a hillside stops sooner, and neither is modelled: the tool has no terrain.
 */
export function flyAtAngle(shot: Shot, angleDegrees: number): Flight | null {
  if (!isPositive(shot.muzzleSpeedMs)) return null;
  if (!Number.isFinite(angleDegrees) || angleDegrees < 0 || angleDegrees > 90) return null;
  if (!Number.isFinite(shot.launchHeightMeters) || shot.launchHeightMeters < 0) return null;
  if (shot.vacuum !== true) {
    if (!isPositive(shot.projectile.dragFactor) || !isPositive(shot.projectile.massKg)) return null;
    if (!isPositive(shot.air.temperatureK) || !isPositive(shot.air.pressurePa)) return null;
  }
  const travel = shot.step?.travelMeters ?? STEP_TRAVEL_METERS;
  const maxStep = shot.step?.maxSecondsPerStep ?? MAX_TIME_STEP_SECONDS;
  if (!isPositive(travel) || !isPositive(maxStep)) return null;

  const radians = angleDegrees * DEGREES_TO_RADIANS;
  let state: State = {
    t: 0,
    x: 0,
    y: shot.launchHeightMeters,
    vx: shot.muzzleSpeedMs * Math.cos(radians),
    vy: shot.muzzleSpeedMs * Math.sin(radians),
  };
  let apexMeters = state.y;
  while (state.t < MAX_FLIGHT_SECONDS) {
    const speed = Math.hypot(state.vx, state.vy);
    // A projectile hanging at the top of a vertical shot would otherwise ask for an
    // unbounded step, so the step is capped by time as well as by distance.
    const dt = Math.min(maxStep, travel / Math.max(speed, 1));
    const next = advance(state, shot, dt);
    if (next.y > apexMeters) apexMeters = next.y;
    if (next.y <= 0) {
      // The ground is crossed inside this step, so the landing is read off the straight
      // line between its ends rather than at the end of it.
      const span = next.y - state.y;
      const fraction = span === 0 ? 0 : (0 - state.y) / span;
      return readFlight(blend(state, next, fraction), shot, apexMeters);
    }
    state = next;
  }
  // Nothing a shoulder arm fires is still up after ten minutes; a shot that gets here has
  // been given input the model cannot fly, and a silent wrong answer would be worse.
  return null;
}

export interface MaxRange {
  angleDegrees: number;
  flight: Flight;
}

/** Where the coarse sweep looks before the search narrows in on the peak. */
export const COARSE_ANGLE_STEP_DEGREES = 5;
export const COARSE_ANGLE_MAX_DEGREES = 70;
/** The search stops once the bracket is this narrow; the range is flat enough there to settle it. */
export const ANGLE_TOLERANCE_DEGREES = 0.05;

const GOLDEN_RATIO_INVERSE = (Math.sqrt(5) - 1) / 2;

/**
 * The angle that carries furthest, and the shot fired at it.
 *
 * Without air it would be 45 degrees. With air the projectile spends the climb paying for
 * height it then has to fall back through, so the best angle drops: for small arms it
 * comes out around thirty degrees, which is where the published figures put it as well.
 *
 * The peak is found by sweeping coarsely and then closing in by golden section on the
 * bracket around the best coarse angle. That takes range against angle to have one peak,
 * which is what a drag law that grows with speed gives; a test checks the result against a
 * fine sweep rather than trusting the assumption.
 */
export function findMaxRange(shot: Shot): MaxRange | null {
  let best: MaxRange | null = null;
  const consider = (angleDegrees: number): Flight | null => {
    const flight = flyAtAngle(shot, angleDegrees);
    if (flight === null) return null;
    if (best === null || flight.rangeMeters > best.flight.rangeMeters) best = { angleDegrees, flight };
    return flight;
  };
  for (let angle = 0; angle <= COARSE_ANGLE_MAX_DEGREES; angle += COARSE_ANGLE_STEP_DEGREES) consider(angle);
  if (best === null) return null;

  // The peak lies within one coarse step of the best coarse angle, so that is the bracket.
  const peak: MaxRange = best;
  let low = Math.max(0, peak.angleDegrees - COARSE_ANGLE_STEP_DEGREES);
  let high = Math.min(90, peak.angleDegrees + COARSE_ANGLE_STEP_DEGREES);
  let innerLow = high - GOLDEN_RATIO_INVERSE * (high - low);
  let innerHigh = low + GOLDEN_RATIO_INVERSE * (high - low);
  let rangeLow = consider(innerLow)?.rangeMeters ?? -Infinity;
  let rangeHigh = consider(innerHigh)?.rangeMeters ?? -Infinity;
  while (high - low > ANGLE_TOLERANCE_DEGREES) {
    if (rangeLow >= rangeHigh) {
      high = innerHigh;
      innerHigh = innerLow;
      rangeHigh = rangeLow;
      innerLow = high - GOLDEN_RATIO_INVERSE * (high - low);
      rangeLow = consider(innerLow)?.rangeMeters ?? -Infinity;
    } else {
      low = innerLow;
      innerLow = innerHigh;
      rangeLow = rangeHigh;
      innerHigh = low + GOLDEN_RATIO_INVERSE * (high - low);
      rangeHigh = consider(innerHigh)?.rangeMeters ?? -Infinity;
    }
  }
  return best;
}

/** The angles the table on the screen opens with: a shot let off flat, and ones let off high. */
export const TABLE_ANGLES_DEGREES = [0, 5, 10, 15, 20, 30, 45, 60] as const;

export interface AngleRow {
  angleDegrees: number;
  flight: Flight | null;
}

export function rangeTable(shot: Shot, anglesDegrees: readonly number[] = TABLE_ANGLES_DEGREES): AngleRow[] {
  return anglesDegrees.map((angleDegrees) => ({ angleDegrees, flight: flyAtAngle(shot, angleDegrees) }));
}

/**
 * Journée's rule: the maximum range of spherical lead shot in yards is about 2200 times the
 * pellet diameter in inches, whatever velocity it was thrown at.
 *
 * It is an empirical rule from experiments published early in the twentieth century, not a
 * calculation, and it is kept here for one purpose: to put an independent number beside the
 * integration for a lead pellet, so a reader can see the two agree. It is not used in the
 * calculation and it says nothing about steel shot, which is lighter for its size and comes
 * down sooner.
 */
export const JOURNEE_YARDS_PER_INCH = 2200;

export function journeeRangeMeters(diameterMeters: number): number {
  if (!isPositive(diameterMeters)) return NaN;
  const diameterInches = (diameterMeters * 1000) / MM_PER_INCH;
  return diameterInches * JOURNEE_YARDS_PER_INCH * METERS_PER_YARD;
}

export function toDiameterMeters(value: number, unit: DiameterUnit): number {
  return unit === 'inch' ? (value * MM_PER_INCH) / 1000 : value / 1000;
}

export function fromDiameterMeters(meters: number, unit: DiameterUnit): number {
  return unit === 'inch' ? (meters * 1000) / MM_PER_INCH : meters * 1000;
}

export function toHeightMeters(value: number, unit: HeightUnit): number {
  return unit === 'ft' ? value * METERS_PER_FOOT : value;
}

export function fromHeightMeters(meters: number, unit: HeightUnit): number {
  return unit === 'ft' ? meters / METERS_PER_FOOT : meters;
}

/** The inverse of ./trajectory's toKilograms, which that file never needs and so never wrote. */
export function fromKilograms(kilograms: number, unit: MassUnit): number {
  return unit === 'grain' ? (kilograms * 1000) / GRAMS_PER_GRAIN : kilograms * 1000;
}

export function toFootPounds(joules: number): number {
  return joules / JOULES_PER_FOOT_POUND;
}

/**
 * Decimals kept when a field is rewritten into another unit, as the recoil tool keeps them:
 * fine enough that the rewritten number stands for the same projectile, coarse enough to
 * stay readable. Moving a unit back and forth can therefore shift the last digit.
 */
const SPEED_DECIMALS: Record<SpeedUnit, number> = { mps: 1, fps: 1 };
const MASS_DECIMALS: Record<MassUnit, number> = { g: 3, grain: 1 };
const DIAMETER_DECIMALS: Record<DiameterUnit, number> = { mm: 3, inch: 4 };
const HEIGHT_DECIMALS: Record<HeightUnit, number> = { m: 2, ft: 2 };

function round(value: number, decimals: number): number {
  // A field the reader is still typing can be NaN, and it has to survive a unit change as one.
  if (!Number.isFinite(value)) return value;
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
}

export function convertSpeed(value: number, from: SpeedUnit, to: SpeedUnit): number {
  return from === to ? value : round(fromMetersPerSecond(toMetersPerSecond(value, from), to), SPEED_DECIMALS[to]);
}

export function convertMass(value: number, from: MassUnit, to: MassUnit): number {
  return from === to ? value : round(fromKilograms(toKilograms(value, from), to), MASS_DECIMALS[to]);
}

export function convertDiameter(value: number, from: DiameterUnit, to: DiameterUnit): number {
  return from === to ? value : round(fromDiameterMeters(toDiameterMeters(value, from), to), DIAMETER_DECIMALS[to]);
}

export function convertHeight(value: number, from: HeightUnit, to: HeightUnit): number {
  return from === to ? value : round(fromHeightMeters(toHeightMeters(value, from), to), HEIGHT_DECIMALS[to]);
}

export type MaxRangeCautionKey = 'muzzleSpeed' | 'mass' | 'diameter' | 'density' | 'launchHeight';

/**
 * The band each quantity stays inside before the tool stops calling it small arms.
 *
 * As in the recoil tool, these bounds are editorial rather than physical: the integration
 * holds for any positive number, so a value outside the band is still flown and only
 * carries a warning. The room is wide on purpose - an air rifle pellet at one end, the
 * fastest rifle loads and a tungsten pellet at the other - so that only a plainly mistyped
 * figure trips it.
 */
export const PLAUSIBLE_RANGES: Record<MaxRangeCautionKey, { min: number; max: number }> = {
  muzzleSpeed: { min: 50, max: 1500 },
  mass: { min: 0.0001, max: 0.2 },
  diameter: { min: 0.0005, max: 0.025 },
  density: { min: 1000, max: 20000 },
  launchHeight: { min: 0, max: 100 },
};

export interface MaxRangeCaution {
  key: MaxRangeCautionKey;
  bound: 'below' | 'above';
  /** The bound that was crossed, in SI, so the screen can show it in whichever unit is set. */
  limit: number;
}

function collectCautions(values: Partial<Record<MaxRangeCautionKey, number>>): MaxRangeCaution[] {
  return (Object.keys(values) as MaxRangeCautionKey[]).flatMap((key): MaxRangeCaution[] => {
    const value = values[key];
    const range = PLAUSIBLE_RANGES[key];
    if (value === undefined || !Number.isFinite(value)) return [];
    if (value < range.min) return [{ key, bound: 'below', limit: range.min }];
    if (value > range.max) return [{ key, bound: 'above', limit: range.max }];
    return [];
  });
}

export interface MaxRangeResult {
  kind: ProjectileKind;
  massKg: number;
  muzzleSpeedMs: number;
  muzzleEnergyJoules: number;
  launchHeightMeters: number;
  /** The air at the firing point, which the column above it is built from. */
  densityKgPerM3: number;
  speedOfSoundMs: number;
  /** The shot at the elevation the reader set. */
  chosen: Flight | null;
  /** The elevation that carries furthest, and the shot fired at it. */
  maximum: MaxRange | null;
  table: AngleRow[];
  /**
   * Journée's rule for this pellet, for a sphere only. It is shown beside the integration
   * as a second opinion, never instead of it, and it speaks only for lead.
   */
  journeeMeters: number | null;
  cautions: MaxRangeCaution[];
}

/**
 * Everything the screen shows, from the form it shows.
 *
 * Returns null only when the form cannot be flown at all - a missing weight, a speed of
 * zero, an atmosphere that resolves to nothing. A figure that is merely improbable is
 * flown and carries a caution, because the arithmetic is as true of it as of anything else.
 */
export function calculateMaxRange(settings: MaxRangeSettings): MaxRangeResult | null {
  const conditions = resolveConditions(settings.atmosphere);
  if (conditions === null) return null;
  const muzzleSpeedMs = toMetersPerSecond(settings.muzzleSpeed.value, settings.muzzleSpeed.unit);
  const launchHeightMeters = toHeightMeters(settings.launchHeight.value, settings.launchHeight.unit);
  if (!isPositive(muzzleSpeedMs)) return null;
  if (!Number.isFinite(launchHeightMeters) || launchHeightMeters < 0) return null;

  const diameterMeters = toDiameterMeters(settings.sphere.diameter.value, settings.sphere.diameter.unit);
  const projectile =
    settings.kind === 'bullet'
      ? bulletProjectile({
          ballisticCoefficient: settings.bullet.ballisticCoefficient,
          dragModel: settings.bullet.dragModel,
          massKg: toKilograms(settings.bullet.mass.value, settings.bullet.mass.unit),
        })
      : sphereProjectile({ diameterMeters, densityKgPerM3: settings.sphere.densityKgPerM3 });
  if (projectile === null) return null;

  const shot: Shot = {
    projectile,
    muzzleSpeedMs,
    launchHeightMeters,
    air: { temperatureK: conditions.temperatureK, pressurePa: conditions.pressurePa },
  };
  return {
    kind: settings.kind,
    massKg: projectile.massKg,
    muzzleSpeedMs,
    muzzleEnergyJoules: 0.5 * projectile.massKg * muzzleSpeedMs ** 2,
    launchHeightMeters,
    densityKgPerM3: conditions.densityKgPerM3,
    speedOfSoundMs: conditions.speedOfSoundMs,
    chosen: flyAtAngle(shot, settings.elevationDegrees),
    maximum: findMaxRange(shot),
    table: rangeTable(shot),
    journeeMeters: settings.kind === 'sphere' ? journeeRangeMeters(diameterMeters) : null,
    cautions: collectCautions(
      settings.kind === 'bullet'
        ? { muzzleSpeed: muzzleSpeedMs, mass: projectile.massKg, launchHeight: launchHeightMeters }
        : {
            muzzleSpeed: muzzleSpeedMs,
            diameter: diameterMeters,
            density: settings.sphere.densityKgPerM3,
            launchHeight: launchHeightMeters,
          },
    ),
  };
}
