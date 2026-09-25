/**
 * Flat-fire point mass trajectories for small arms.
 *
 * The bullet is treated as a point with three degrees of freedom: it carries drag along
 * the wind-relative velocity and weight downwards, and nothing else. The drag is read
 * from a published standard drag function (see `./trajectory-drag`) and scaled by the
 * ballistic coefficient the bullet maker publishes against that same function. This is
 * the model the published drop charts are built on, set out in Robert L. McCoy,
 * "Modern Exterior Ballistics", 2nd ed., chapter 5, "The Flat-Fire Point Mass
 * Trajectory", and chapter 7, "The Effect of Wind on Flat-Fire Trajectories".
 *
 * What the model leaves out, because it needs data a shooter does not have to hand:
 * spin drift, aerodynamic jump, the Coriolis effect, vertical wind, and any change of the
 * bullet's own drag with yaw. Over the distances this tool is meant for they stay below
 * the spread of the load itself.
 *
 * Three things the published tables leave at their reference values can be set here: the
 * humidity of the air, the slope of the line of sight, and the temperature of the powder.
 * Each is a separate step below and each says where its numbers come from.
 */

import type { ClickSetting } from './schemas/sight-adjustment';
import type {
  AltitudeUnit,
  DistanceUnit,
  DragModel,
  DropUnit,
  MassUnit,
  PowderSensitivityUnit,
  PressureSource,
  PressureUnit,
  SightHeightUnit,
  SpeedUnit,
  TemperatureUnit,
  WindPreset,
  WindSpeedUnit,
} from './schemas/trajectory';
import { MIL_RADIANS, MM_PER_INCH, MOA_RADIANS, clickSizeMm, toMeters, toMillimeters } from './sight-adjustment';
import { dragCoefficient } from './trajectory-drag';

export type { ClickSetting } from './schemas/sight-adjustment';
export type {
  AltitudeUnit,
  AtmosphereSetting,
  DistanceUnit,
  DragModel,
  DropUnit,
  MassUnit,
  PowderSensitivityUnit,
  PowderTemperatureSetting,
  PressureSource,
  PressureUnit,
  SightHeightUnit,
  SpeedUnit,
  TemperatureUnit,
  TrajectorySettings,
  WindPreset,
  WindSetting,
  WindSpeedUnit,
} from './schemas/trajectory';
export {
  altitudeInRange,
  altitudeRange,
  temperatureInRange,
  temperatureRange,
  usesAltitude,
  usesPressureReading,
} from './schemas/trajectory';

/** International foot: exactly 0.3048 m. */
export const METERS_PER_FOOT = 0.3048;
/** International avoirdupois pound: exactly 0.45359237 kg. */
export const KILOGRAMS_PER_POUND = 0.45359237;
/** International grain: 1/7000 of a pound, exactly 64.79891 mg. */
export const GRAMS_PER_GRAIN = 0.06479891;
/** International mile per hour: 1609.344 m in an hour. */
export const METERS_PER_SECOND_PER_MPH = 1609.344 / 3600;
/** Standard acceleration of free fall, fixed by the 3rd CGPM (1901). */
export const STANDARD_GRAVITY = 9.80665;
/** One foot-pound of energy: a pound-force acting through a foot. */
export const JOULES_PER_FOOT_POUND = METERS_PER_FOOT * KILOGRAMS_PER_POUND * STANDARD_GRAVITY;
/** Conventional inch of mercury, as defined in NIST Special Publication 811. */
export const PASCALS_PER_INCH_OF_MERCURY = 3386.389;

/**
 * A ballistic coefficient of 1 lb/in² as mass over area in SI.
 *
 * Ballistic coefficients are published in pounds per square inch because the standard
 * projectile of every drag function is one inch across and weighs one pound. Dividing the
 * standard projectile's drag by this ratio is what turns a drag function into a real bullet.
 */
export const BC_UNIT_KG_PER_SQUARE_METER = KILOGRAMS_PER_POUND / (MM_PER_INCH / 1000) ** 2;

/** The reference atmosphere of ISO 2533: 15 °C and 1013.25 hPa at sea level. */
export const STANDARD_TEMPERATURE_CELSIUS = 15;
export const STANDARD_PRESSURE_HPA = 1013.25;
export const STANDARD_PRESSURE_PA = STANDARD_PRESSURE_HPA * 100;

const KELVIN_AT_ZERO_CELSIUS = 273.15;
const ISA_SEA_LEVEL_TEMPERATURE_K = STANDARD_TEMPERATURE_CELSIUS + KELVIN_AT_ZERO_CELSIUS;
/** Specific gas constant of dry air, ISO 2533. */
const DRY_AIR_GAS_CONSTANT = 287.05287;
/** Ratio of the specific heats of dry air, ISO 2533. */
const HEAT_CAPACITY_RATIO = 1.4;
/** Temperature lapse rate of the troposphere in the ISO 2533 / ICAO standard atmosphere. */
export const ISA_LAPSE_RATE_K_PER_M = 0.0065;
/** Exponent of that same standard atmosphere's barometric formula, g₀M/(RL). */
export const ISA_PRESSURE_EXPONENT = 5.255877;
/** Radius of the sphere ISO 2533 takes the Earth to be when it converts between heights. */
const ISA_EARTH_RADIUS = 6356766;

/**
 * Fixed step of the integration, in seconds.
 *
 * It is small for a reason beyond accuracy alone. The drag coefficient runs as a straight
 * line between the published points, so its slope jumps at every one of them, and
 * Runge-Kutta only holds its order while a step stays inside a single segment. At 0.5 ms
 * a supersonic bullet crosses roughly a thousandth of a Mach per step, so nearly every
 * step does. Halving the step moves the drop at 1000 m by far less than a millimetre,
 * which the tests check rather than assert.
 */
export const TIME_STEP_SECONDS = 0.0005;

/**
 * Longest step the integration will accept.
 *
 * Only a test ever sets the step, and this is not a recommendation: it is the line past
 * which a caller has plainly made a mistake. A step of zero would leave the state where
 * it was and never end the loop, and a negative one would run the bullet backwards.
 */
export const MAX_TIME_STEP_SECONDS = 0.05;

/** No small arms projectile is still worth following after this long, so a stalled solve ends here. */
const MAX_FLIGHT_SECONDS = 30;

/** A longer table stops being read, and every extra row costs another slice of the integration. */
export const MAX_TABLE_ROWS = 40;

export function toMetersPerSecond(value: number, unit: SpeedUnit): number {
  return unit === 'fps' ? value * METERS_PER_FOOT : value;
}

export function fromMetersPerSecond(value: number, unit: SpeedUnit): number {
  return unit === 'fps' ? value / METERS_PER_FOOT : value;
}

export function toKilograms(value: number, unit: MassUnit): number {
  return unit === 'grain' ? (value * GRAMS_PER_GRAIN) / 1000 : value / 1000;
}

export function toKelvin(value: number, unit: TemperatureUnit): number {
  return (unit === 'f' ? ((value - 32) * 5) / 9 : value) + KELVIN_AT_ZERO_CELSIUS;
}

export function toPascals(value: number, unit: PressureUnit): number {
  return unit === 'inhg' ? value * PASCALS_PER_INCH_OF_MERCURY : value * 100;
}

export function altitudeToMeters(value: number, unit: AltitudeUnit): number {
  return unit === 'ft' ? value * METERS_PER_FOOT : value;
}

export function windToMetersPerSecond(value: number, unit: WindSpeedUnit): number {
  return unit === 'mph' ? value * METERS_PER_SECOND_PER_MPH : value;
}

/** Metres into the unit the drop and the drift are read in on the target. */
export function fromMetersToDropUnit(meters: number, unit: DropUnit): number {
  return unit === 'inch' ? (meters * 1000) / MM_PER_INCH : meters * 100;
}

export function dropUnitToMeters(value: number, unit: DropUnit): number {
  return toMillimeters(value, unit) / 1000;
}

export function sightHeightToMeters(value: number, unit: SightHeightUnit): number {
  return toMillimeters(value, unit) / 1000;
}

/** Degrees clockwise from twelve o'clock for the wind directions the form offers. */
const WIND_PRESET_DEGREES: Record<Exclude<WindPreset, 'custom'>, number> = {
  '12': 0,
  '1:30': 45,
  '3': 90,
  '4:30': 135,
  '6': 180,
  '7:30': 225,
  '9': 270,
  '10:30': 315,
};

export function windDirectionDegrees(wind: { preset: WindPreset; customFromDegrees: number }): number {
  return wind.preset === 'custom' ? wind.customFromDegrees : WIND_PRESET_DEGREES[wind.preset];
}

export interface Conditions {
  temperatureK: number;
  pressurePa: number;
  densityKgPerM3: number;
  /** Air density against the sea level value of ISO 2533; drag is proportional to it. */
  densityRatio: number;
  speedOfSoundMs: number;
}

/** Density of dry air as an ideal gas. Humidity is not modelled; see the tool's notes. */
export function airDensity(pressurePa: number, temperatureK: number): number {
  return pressurePa / (DRY_AIR_GAS_CONSTANT * temperatureK);
}

/**
 * Speed of sound in dry air, √(γRT).
 *
 * It follows temperature alone and not pressure, which is why a cold day carries a bullet
 * into the transonic rise at a distance where a warm day leaves it supersonic.
 */
export function speedOfSound(temperatureK: number): number {
  return Math.sqrt(HEAT_CAPACITY_RATIO * DRY_AIR_GAS_CONSTANT * temperatureK);
}

/**
 * Molar gas constant, exact since the 2019 redefinition of the SI (CODATA 2018), over the
 * molar mass of water, 18.01528 g/mol: the specific gas constant of water vapour.
 */
const WATER_VAPOUR_GAS_CONSTANT = 8.314462618 / 0.01801528;

/**
 * Saturation vapour pressure over liquid water, in pascals.
 *
 * Arden L. Buck, "New Equations for Computing Vapor Pressure and Enhancement Factor", Journal
 * of Applied Meteorology 20 (1981) 1527-1532, equation (8): e = 6.1121 exp(17.502 t / (240.97 + t))
 * hPa with t in °C. Buck gives it for -20 to +50 °C at a few hundredths of a per cent. It is
 * read over water below freezing as well, because relative humidity is reported against water
 * at every temperature (WMO Guide to Instruments and Methods of Observation, WMO-No. 8), so it is
 * the pressure a hygrometer's figure is a fraction of. Outside Buck's range the air holds so
 * little water, or the tool is so far past any hunting weather, that the density barely moves.
 */
export function saturationVapourPressurePa(temperatureK: number): number {
  const celsius = temperatureK - KELVIN_AT_ZERO_CELSIUS;
  return 611.21 * Math.exp((17.502 * celsius) / (240.97 + celsius));
}

/**
 * Partial pressure of water vapour in air at a relative humidity (0-1).
 *
 * Saturated water vapour in air holds a little more than over pure water, by Buck's (1981)
 * enhancement factor over water, f = 1.0007 + 3.46e-6 P with P in hPa (his equation for e'w), and
 * relative humidity is read against that saturation in air (WMO-No. 8, annex 4.B).
 */
export function vapourPressurePa(pressurePa: number, temperatureK: number, relativeHumidity: number): number {
  const enhancement = 1.0007 + 3.46e-6 * (pressurePa / 100);
  return relativeHumidity * enhancement * saturationVapourPressurePa(temperatureK);
}

/**
 * Density of moist air as a mixture of two ideal gases, dry air and water vapour, each at its
 * own partial pressure. Water vapour is lighter than the air it replaces, so humid air is thinner
 * and a bullet drops a little less in it.
 */
export function humidAirDensity(pressurePa: number, temperatureK: number, relativeHumidity: number): number {
  const vapourPa = vapourPressurePa(pressurePa, temperatureK, relativeHumidity);
  return (
    (pressurePa - vapourPa) / (DRY_AIR_GAS_CONSTANT * temperatureK) +
    vapourPa / (WATER_VAPOUR_GAS_CONSTANT * temperatureK)
  );
}

/**
 * The same conditions with the day's relative humidity in the density.
 *
 * Only the density changes. Humid air also carries sound a few tenths of a per cent faster, which
 * moves the transonic rise by a metre or two at the distances this tool prints; the speed of
 * sound is left at the dry air value and the notes on the page say so. Humidity outside 0-100 %
 * is not a reading, and more vapour than the whole pressure could hold is no air at all.
 */
export function withHumidity(conditions: Conditions, humidityPercent: number): Conditions | null {
  if (!Number.isFinite(humidityPercent) || humidityPercent < 0 || humidityPercent > 100) return null;
  const vapourPa = vapourPressurePa(conditions.pressurePa, conditions.temperatureK, humidityPercent / 100);
  if (!(vapourPa < conditions.pressurePa)) return null;
  const densityKgPerM3 = humidAirDensity(conditions.pressurePa, conditions.temperatureK, humidityPercent / 100);
  return { ...conditions, densityKgPerM3, densityRatio: densityKgPerM3 / STANDARD_AIR_DENSITY };
}

/**
 * Geopotential height for a height read off a map or a satellite receiver.
 *
 * The barometric formula below is written against geopotential height, which folds in the
 * weakening of gravity as you climb; what a shooter knows is the geometric height. The two
 * part company by about a metre at 1000 m and thirteen at 9000 m, worth a fifth of a per
 * cent of the pressure up there, so the conversion is kept rather than waved away.
 */
export function geopotentialHeight(geometricMeters: number): number {
  return (ISA_EARTH_RADIUS * geometricMeters) / (ISA_EARTH_RADIUS + geometricMeters);
}

/** Pressure at a geopotential height: the form the ISO 2533 tables are indexed by. */
export function standardPressureAtGeopotentialPa(
  geopotentialMeters: number,
  seaLevelPa = STANDARD_PRESSURE_PA,
): number {
  const ratio = 1 - (ISA_LAPSE_RATE_K_PER_M * geopotentialMeters) / ISA_SEA_LEVEL_TEMPERATURE_K;
  return seaLevelPa * ratio ** ISA_PRESSURE_EXPONENT;
}

/**
 * Pressure at a height above sea level, from a sea level pressure.
 *
 * With the standard sea level pressure this is the reference atmosphere and knows nothing
 * of the day. Given the sea level pressure a forecast quotes, it carries that reading back
 * down to the firing point, which is what a forecast pressure has to have done to it before
 * it means anything to a bullet. Either way the lapse rate is the standard one, not the
 * day's, so the answer is an estimate of the station pressure and not a measurement of it.
 */
export function standardPressurePa(altitudeMeters: number, seaLevelPa = STANDARD_PRESSURE_PA): number {
  return standardPressureAtGeopotentialPa(geopotentialHeight(altitudeMeters), seaLevelPa);
}

/** Air density at sea level in the reference atmosphere; ISO 2533 rounds it to 1.225 kg/m³. */
export const STANDARD_AIR_DENSITY = airDensity(STANDARD_PRESSURE_PA, ISA_SEA_LEVEL_TEMPERATURE_K);

export interface AtmosphereInput {
  source: PressureSource;
  temperature: { value: number; unit: TemperatureUnit };
  pressure: { value: number; unit: PressureUnit };
  altitude: { value: number; unit: AltitudeUnit };
}

/**
 * Air density and speed of sound from whichever reading the shooter has.
 *
 * A barometer at the firing point already answers the question, so `station` uses it as it
 * stands and never touches the altitude. A forecast or airfield pressure has been carried
 * up to sea level, so `sea-level` has to carry it back down through the height. With no
 * reading at all, `altitude` puts the standard sea level pressure at that height, which
 * is a fair average and cannot follow a high or a low.
 */
export function resolveConditions(atmosphere: AtmosphereInput): Conditions | null {
  const temperatureK = toKelvin(atmosphere.temperature.value, atmosphere.temperature.unit);
  const altitudeMeters = altitudeToMeters(atmosphere.altitude.value, atmosphere.altitude.unit);
  const reading = toPascals(atmosphere.pressure.value, atmosphere.pressure.unit);
  const pressurePa =
    atmosphere.source === 'station'
      ? reading
      : standardPressurePa(altitudeMeters, atmosphere.source === 'sea-level' ? reading : STANDARD_PRESSURE_PA);
  if (!Number.isFinite(temperatureK) || temperatureK <= 0) return null;
  if (!Number.isFinite(pressurePa) || pressurePa <= 0) return null;
  const densityKgPerM3 = airDensity(pressurePa, temperatureK);
  return {
    temperatureK,
    pressurePa,
    densityKgPerM3,
    densityRatio: densityKgPerM3 / STANDARD_AIR_DENSITY,
    speedOfSoundMs: speedOfSound(temperatureK),
  };
}

/** Everything the integration needs about the shot, already in SI. */
interface Shot {
  dragModel: DragModel;
  /** π/8 divided by the ballistic coefficient: the constant part of the drag deceleration. */
  dragFactor: number;
  muzzleSpeedMs: number;
  sightHeightMeters: number;
  /** The wind as a velocity: x downrange, z to the shooter's right. */
  windX: number;
  windZ: number;
  /**
   * Gravity in the frame of the line of sight, x along it and y square to it. Level, all of it
   * is -g along y. Up or down a slope the line of sight is tilted and gravity is not: part of it
   * pulls along the line, back towards the shooter uphill, and only g·cos(slope) pulls the bullet
   * off the line. That is the whole of what a slope does to a point mass.
   */
  gravityX: number;
  gravityY: number;
  densityKgPerM3: number;
  speedOfSoundMs: number;
  timeStepSeconds: number;
}

interface State {
  t: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

interface Rates {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

/** Speed through the air rather than over the ground: the speed drag and Mach are read at. */
function airspeed(state: State, shot: Shot): number {
  const relativeX = state.vx - shot.windX;
  const relativeZ = state.vz - shot.windZ;
  return Math.sqrt(relativeX * relativeX + state.vy * state.vy + relativeZ * relativeZ);
}

/**
 * Drag along the wind-relative velocity, weight downwards.
 *
 * The deceleration of the real bullet is that of the standard projectile at the same Mach
 * number divided by the ballistic coefficient, which is why the drag function and the
 * coefficient have to be quoted against each other: a G7 coefficient read against G1 is
 * not the same bullet.
 */
function rates(state: State, shot: Shot): Rates {
  const relativeX = state.vx - shot.windX;
  // Vertical wind is left out: it is seldom known, and guessing it would be worse than silence.
  const relativeY = state.vy;
  const relativeZ = state.vz - shot.windZ;
  const speed = Math.sqrt(relativeX * relativeX + relativeY * relativeY + relativeZ * relativeZ);
  const drag = dragCoefficient(shot.dragModel, speed / shot.speedOfSoundMs);
  const factor = shot.dragFactor * shot.densityKgPerM3 * drag * speed;
  return {
    x: state.vx,
    y: state.vy,
    z: state.vz,
    vx: -factor * relativeX + shot.gravityX,
    vy: -factor * relativeY + shot.gravityY,
    vz: -factor * relativeZ,
  };
}

function shift(state: State, by: Rates, dt: number): State {
  return {
    t: state.t + dt,
    x: state.x + by.x * dt,
    y: state.y + by.y * dt,
    z: state.z + by.z * dt,
    vx: state.vx + by.vx * dt,
    vy: state.vy + by.vy * dt,
    vz: state.vz + by.vz * dt,
  };
}

/**
 * One fourth-order Runge-Kutta step.
 *
 * Runge-Kutta rather than Euler because drag is what the answer is made of. Euler holds
 * the deceleration of the start of the step for the whole step, so it always sheds speed
 * too fast and the error piles up in one direction instead of cancelling. Matching this
 * drop with Euler needs a step short enough to make the zero solve and the point blank
 * solve visibly slow, and both of those run the integration over and over.
 */
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
    z: state.z + sixth * (a.z + 2 * b.z + 2 * c.z + d.z),
    vx: state.vx + sixth * (a.vx + 2 * b.vx + 2 * c.vx + d.vx),
    vy: state.vy + sixth * (a.vy + 2 * b.vy + 2 * c.vy + d.vy),
    vz: state.vz + sixth * (a.vz + 2 * b.vz + 2 * c.vz + d.vz),
  };
}

/** Where a value between two steps falls, read off a straight line between them. */
function blendStates(from: State, to: State, fraction: number): State {
  const mix = (a: number, b: number) => a + (b - a) * fraction;
  return {
    t: mix(from.t, to.t),
    x: mix(from.x, to.x),
    y: mix(from.y, to.y),
    z: mix(from.z, to.z),
    vx: mix(from.vx, to.vx),
    vy: mix(from.vy, to.vy),
    vz: mix(from.vz, to.vz),
  };
}

function crossingFraction(fromValue: number, toValue: number, target: number): number {
  const span = toValue - fromValue;
  return span === 0 ? 0 : (target - fromValue) / span;
}

/** How far the bullet is from the line of sight, in any direction: drop and drift together. */
function radialOffset(state: State): number {
  return Math.hypot(state.y, state.z);
}

interface FlightOptions {
  /** Distances in metres, ascending, at which a sample is wanted. */
  samples?: readonly number[];
  /** Stop once the bullet has passed this distance. */
  limitMeters: number;
  /**
   * Radius of the target circle drawn around the line of sight.
   *
   * The run records where the bullet first leaves that circle, drop and drift taken
   * together, and stops once it is outside it and falling. This is the only thing that
   * bounds a run with no distance limit.
   */
  circleRadiusMeters?: number;
}

interface Flight {
  /** One entry per requested distance; null where the bullet never got that far. */
  samples: (State | null)[];
  /** The highest the path reached above the line of sight, and where. */
  apex: { distanceMeters: number; heightMeters: number };
  /** Where the rising path crosses the line of sight, and where it falls back through it. */
  nearZeroMeters: number | null;
  farZeroMeters: number | null;
  /** Where the bullet first passes outside the target circle. */
  circleExitMeters: number | null;
  reachedMeters: number;
}

/**
 * Fire one trajectory at a departure angle and read the events off it.
 *
 * Heights are measured from the line of sight, not from the bore, so the bullet starts a
 * scope height below zero and climbs across it. That is the convention every printed drop
 * chart uses, and it is what makes the two crossings and the point blank range fall out.
 */
function fly(shot: Shot, angleRadians: number, options: FlightOptions): Flight {
  const wanted = options.samples ?? [];
  const samples: (State | null)[] = wanted.map(() => null);
  let nextSample = 0;
  let state: State = {
    t: 0,
    x: 0,
    y: -shot.sightHeightMeters,
    z: 0,
    vx: shot.muzzleSpeedMs * Math.cos(angleRadians),
    vy: shot.muzzleSpeedMs * Math.sin(angleRadians),
    vz: 0,
  };
  let apex = { distanceMeters: 0, heightMeters: state.y };
  let nearZeroMeters: number | null = null;
  let farZeroMeters: number | null = null;
  let circleExitMeters: number | null = null;
  const radius = options.circleRadiusMeters;

  while (state.x < options.limitMeters && state.t < MAX_FLIGHT_SECONDS && state.vx > 0) {
    const next = advance(state, shot, shot.timeStepSeconds);
    while (nextSample < wanted.length) {
      const target = wanted[nextSample];
      if (target === undefined || next.x < target) break;
      samples[nextSample] = blendStates(state, next, crossingFraction(state.x, next.x, target));
      nextSample += 1;
    }
    if (state.vy > 0 && next.vy <= 0) {
      const top = blendStates(state, next, crossingFraction(state.vy, next.vy, 0));
      apex = { distanceMeters: top.x, heightMeters: top.y };
    }
    if (nearZeroMeters === null && state.y < 0 && next.y >= 0) {
      nearZeroMeters = blendStates(state, next, crossingFraction(state.y, next.y, 0)).x;
    }
    if (state.y >= 0 && next.y < 0) {
      farZeroMeters = blendStates(state, next, crossingFraction(state.y, next.y, 0)).x;
    }
    if (radius !== undefined && circleExitMeters === null) {
      const from = radialOffset(state);
      const to = radialOffset(next);
      if (from <= radius && to > radius) {
        circleExitMeters = blendStates(state, next, crossingFraction(from, to, radius)).x;
      }
    }
    state = next;
    // Outside the circle and falling: drop only grows from here and drift never comes back.
    if (radius !== undefined && circleExitMeters !== null && state.vy < 0) break;
  }
  // A path that never turned over is still rising, so its highest point is where it stopped.
  if (state.vy > 0) apex = { distanceMeters: state.x, heightMeters: state.y };
  return { samples, apex, nearZeroMeters, farZeroMeters, circleExitMeters, reachedMeters: state.x };
}

/**
 * Largest angle at which a rising function is still at or below a target.
 *
 * Both solves here are on smooth functions that grow with the departure angle, so a
 * secant step lands very close. The bracket is kept all the same and bisection takes over
 * whenever a step would leave it, which is what stops a poor first guess running away.
 *
 * The answer is deliberately taken from below the target rather than from whichever side
 * the last step happened to land on. The point blank solve puts the top of the arc on the
 * edge of the target circle, and an answer a hair over the edge would read as a bullet
 * that had already left the circle at the top of its own arc.
 */
function solveRising(
  evaluate: (angle: number) => number,
  target: number,
  guess: number,
  tolerance: number,
): number | null {
  let low = 0;
  let lowValue = evaluate(low) - target;
  if (!Number.isFinite(lowValue)) return null;
  if (lowValue >= 0) return low;
  let high = Number.isFinite(guess) && guess > 0 ? guess : 0.001;
  let highValue = evaluate(high) - target;
  for (let expansion = 0; expansion < 24 && Number.isFinite(highValue) && highValue < 0; expansion += 1) {
    low = high;
    lowValue = highValue;
    high *= 2;
    highValue = evaluate(high) - target;
  }
  if (!Number.isFinite(highValue) || highValue < 0) return null;
  for (let iteration = 0; iteration < 40; iteration += 1) {
    const secant = high - (highValue * (high - low)) / (highValue - lowValue);
    const angle = Number.isFinite(secant) && secant > low && secant < high ? secant : (low + high) / 2;
    const value = evaluate(angle) - target;
    if (!Number.isFinite(value)) return null;
    if (value <= 0) {
      low = angle;
      lowValue = value;
      if (value >= -tolerance) return angle;
    } else {
      high = angle;
      highValue = value;
    }
    if (high - low < 1e-12) return low;
  }
  return low;
}

/** Departure angle a bullet would need in a vacuum, as the first guess at the real one. */
function vacuumZeroAngle(shot: Shot, distanceMeters: number): number {
  const rise = shot.sightHeightMeters + (STANDARD_GRAVITY * distanceMeters ** 2) / (2 * shot.muzzleSpeedMs ** 2);
  return Math.atan(rise / distanceMeters);
}

/**
 * Everything the integration needs except the departure angle, already in SI.
 *
 * The ballistic coefficient enters in one place only. It is quoted in pounds per square inch
 * of frontal area, and turning it into the constant part of the drag deceleration is the step
 * that would quietly differ between two copies of it.
 */
function makeShot(parts: {
  dragModel: DragModel;
  ballisticCoefficient: number;
  muzzleSpeedMs: number;
  sightHeightMeters: number;
  windX: number;
  windZ: number;
  /** Slope of the line of sight, positive uphill. */
  inclineRadians: number;
  conditions: Conditions;
  timeStepSeconds: number;
}): Shot {
  return {
    dragModel: parts.dragModel,
    dragFactor: Math.PI / 8 / (parts.ballisticCoefficient * BC_UNIT_KG_PER_SQUARE_METER),
    muzzleSpeedMs: parts.muzzleSpeedMs,
    sightHeightMeters: parts.sightHeightMeters,
    windX: parts.windX,
    windZ: parts.windZ,
    gravityX: -STANDARD_GRAVITY * Math.sin(parts.inclineRadians),
    gravityY: -STANDARD_GRAVITY * Math.cos(parts.inclineRadians),
    densityKgPerM3: parts.conditions.densityKgPerM3,
    speedOfSoundMs: parts.conditions.speedOfSoundMs,
    timeStepSeconds: parts.timeStepSeconds,
  };
}

/** The departure angle that puts the path on the line of sight at a distance. */
function sightIn(shot: Shot, zeroDistanceMeters: number): number | null {
  // A tenth of a millimetre at the zero distance is well under the smallest click any sight has.
  return solveRising(
    (angle) =>
      fly(shot, angle, { samples: [zeroDistanceMeters], limitMeters: zeroDistanceMeters }).samples[0]?.y ?? NaN,
    0,
    vacuumZeroAngle(shot, zeroDistanceMeters),
    0.0001,
  );
}

export interface TrajectoryRow {
  distanceMeters: number;
  /** Below the line of sight is positive: this is the correction to dial or hold up. */
  dropMeters: number;
  dropMoa: number;
  dropMil: number;
  /** To the shooter's right is positive: that is where the bullet goes, so the hold goes left. */
  driftMeters: number;
  driftMoa: number;
  driftMil: number;
  /** Speed over the ground, which is what the bullet arrives with. */
  speedMs: number;
  /** Mach of the speed through the air, the speed the drag function was read at. */
  mach: number;
  energyJoules: number;
  timeSeconds: number;
}

/** Why a point blank range could not be given. */
export type PointBlankUnavailable = 'sight-above-radius' | 'unsolved';

export interface PointBlankResult {
  /** In still air: the figure a shooter sights in by, before the day's wind is known. */
  rangeMeters: number;
  /** The zero that goes with it, which is the distance to sight in at. */
  zeroMeters: number;
  apex: { distanceMeters: number; heightMeters: number };
  /**
   * The same zero in the wind that was entered, measured as distance from the line of
   * sight rather than drop alone. It equals the still air range with no wind and falls
   * away quickly with a crosswind, because drift leaves the circle sideways.
   */
  windLimitedRangeMeters: number | null;
}

export interface TrajectoryResult {
  conditions: Conditions;
  /** The velocity of the day, after the powder temperature. */
  muzzleSpeedMs: number;
  /** The velocity the rifle was sighted in with. The same as the above when the powder is at its reference. */
  zeroMuzzleSpeedMs: number;
  muzzleEnergyJoules: number;
  massKg: number;
  zeroAngleRadians: number;
  zeroDistanceMeters: number;
  /** Both places the path meets the line of sight, whichever of them was asked for. */
  nearZeroMeters: number | null;
  farZeroMeters: number | null;
  /** Which of the two crossings the requested zero distance turned out to be. */
  zeroSide: 'rising' | 'falling';
  apex: { distanceMeters: number; heightMeters: number };
  rows: TrajectoryRow[];
  /** True when the row limit cut the table short of the distance that was asked for. */
  truncated: boolean;
  /** Furthest distance the integration carried the bullet to. */
  reachedMeters: number;
  pointBlank: PointBlankResult | null;
  pointBlankUnavailable: PointBlankUnavailable | null;
  windFromDegrees: number;
  windSpeedMs: number;
}

/** The sensitivity of the muzzle velocity to the powder's temperature, in m/s per kelvin. */
export function powderSensitivityMsPerKelvin(value: number, unit: PowderSensitivityUnit): number {
  // A degree Fahrenheit is five ninths of a kelvin, so a change per °F is nine fifths of one per K.
  return unit === 'fps-per-f' ? (value * METERS_PER_FOOT * 9) / 5 : value;
}

export interface PowderTemperatureInput {
  sensitivity: { value: number; unit: PowderSensitivityUnit };
  unit: TemperatureUnit;
  /** The powder temperature the muzzle velocity was measured at. */
  reference: number;
  /** The powder temperature of the day being worked out. */
  temperature: number;
}

/**
 * The muzzle velocity at the powder temperature of the day.
 *
 * A chronograph reading holds for the temperature the cartridges were at when it was taken.
 * Warmer powder burns faster and gives more velocity, colder powder less, and over the
 * temperatures a rifle is used at the change is close enough to a straight line that makers
 * and ballistic programs quote it as a single rate: so many m/s, or fps, per degree. That rate
 * is what is entered here. It differs from powder to powder and is best measured, so it opens at
 * zero, which is the published table's own assumption that the velocity never changes.
 */
export function adjustedMuzzleSpeedMs(muzzleSpeedMs: number, powder: PowderTemperatureInput): number {
  const perKelvin = powderSensitivityMsPerKelvin(powder.sensitivity.value, powder.sensitivity.unit);
  const change = toKelvin(powder.temperature, powder.unit) - toKelvin(powder.reference, powder.unit);
  return muzzleSpeedMs + perKelvin * change;
}

export interface TrajectoryInput {
  muzzleSpeed: { value: number; unit: SpeedUnit };
  mass: { value: number; unit: MassUnit };
  ballisticCoefficient: number;
  dragModel: DragModel;
  sightHeight: { value: number; unit: SightHeightUnit };
  distanceUnit: DistanceUnit;
  zeroDistance: number;
  step: number;
  maxRange: number;
  dropUnit: DropUnit;
  vitalRadius: number;
  wind: { speed: number; unit: WindSpeedUnit; preset: WindPreset; customFromDegrees: number };
  atmosphere: AtmosphereInput;
  /**
   * Relative humidity, 0 to 100. Absent when it was not entered: the air is then taken as dry, as
   * the published tables and this tool before the field existed take it, and the screen says so.
   */
  humidityPercent?: number;
  /**
   * Slope of the line of sight in degrees, positive uphill. Absent when it was not entered: the shot
   * is then level, which is what a table without a slope describes.
   */
  inclineDegrees?: number;
  /** Absent when no powder temperature was entered: the velocity is then the one entered. */
  powder?: PowderTemperatureInput;
  /** Only the tests set this, to show that the answer stops moving as the step shrinks. */
  timeStepSeconds?: number;
}

/** The angle an offset subtends at a distance, as atan rather than a small-angle shortcut. */
function angleOf(offsetMeters: number, distanceMeters: number): number {
  return Math.atan(offsetMeters / distanceMeters);
}

function sampleDistances(input: TrajectoryInput): { meters: number[]; truncated: boolean } {
  const meters: number[] = [];
  // A step that divides the range exactly must still produce that last row, hence the slack.
  const count = Math.floor(input.maxRange / input.step + 1e-9);
  const capped = Math.min(count, MAX_TABLE_ROWS);
  for (let index = 1; index <= capped; index += 1) meters.push(toMeters(input.step * index, input.distanceUnit));
  return { meters, truncated: capped < count };
}

/** Everything one trajectory needs, solved once and flown as often as the caller likes. */
interface Prepared {
  conditions: Conditions;
  massKg: number;
  /** The velocity of the day, after the powder temperature. */
  muzzleSpeedMs: number;
  /** The velocity the rifle was sighted in with, at the reference powder temperature. */
  zeroMuzzleSpeedMs: number;
  zeroDistanceMeters: number;
  zeroAngleRadians: number;
  vitalRadiusMeters: number;
  windSpeedMs: number;
  windFromDegrees: number;
  /** The shot of the day: its velocity, its wind, its slope. */
  shot: Shot;
  /** The same shot on level ground, which is where a point blank range is sighted in. */
  levelShot: Shot;
}

/**
 * Solve the zero and build the shot of the day.
 *
 * The rifle is sighted in on level ground with the velocity it had when the chronograph was read,
 * that is at the reference powder temperature, and then fired on the day with whatever velocity
 * the powder gives and up or down whatever slope there is. Sighting in again for the day's
 * velocity would put every table back on the line of sight at the zero distance, which is the one
 * thing a change of powder temperature does not do. The zero is solved in the day's air: the tool
 * holds a single atmosphere, not a separate one for the day the rifle was zeroed.
 */
function prepare(input: TrajectoryInput): Prepared | null {
  const zeroMuzzleSpeedMs = toMetersPerSecond(input.muzzleSpeed.value, input.muzzleSpeed.unit);
  const muzzleSpeedMs =
    input.powder === undefined ? zeroMuzzleSpeedMs : adjustedMuzzleSpeedMs(zeroMuzzleSpeedMs, input.powder);
  const inclineDegrees = input.inclineDegrees ?? 0;
  const massKg = toKilograms(input.mass.value, input.mass.unit);
  const sightHeightMeters = sightHeightToMeters(input.sightHeight.value, input.sightHeight.unit);
  const zeroDistanceMeters = toMeters(input.zeroDistance, input.distanceUnit);
  const vitalRadiusMeters = dropUnitToMeters(input.vitalRadius, input.dropUnit);
  const windSpeedMs = windToMetersPerSecond(input.wind.speed, input.wind.unit);
  const windFromDegrees = windDirectionDegrees(input.wind);
  const timeStepSeconds = input.timeStepSeconds ?? TIME_STEP_SECONDS;
  const dryConditions = resolveConditions(input.atmosphere);
  if (dryConditions === null) return null;
  const conditions =
    input.humidityPercent === undefined ? dryConditions : withHumidity(dryConditions, input.humidityPercent);
  if (conditions === null) return null;
  if (!(zeroMuzzleSpeedMs > 0) || !(muzzleSpeedMs > 0) || !(massKg > 0) || !(input.ballisticCoefficient > 0))
    return null;
  if (!(sightHeightMeters >= 0) || !(zeroDistanceMeters > 0)) return null;
  if (!(input.step > 0) || !(input.maxRange > 0) || !(vitalRadiusMeters > 0)) return null;
  if (!(windSpeedMs >= 0) || !Number.isFinite(windFromDegrees)) return null;
  // Straight up or down there is no line of sight left to measure a drop from.
  if (!Number.isFinite(inclineDegrees) || Math.abs(inclineDegrees) >= 90) return null;
  // A step of zero never moves the state on, so the loop would never reach its own end.
  if (!(timeStepSeconds > 0) || timeStepSeconds > MAX_TIME_STEP_SECONDS) return null;

  // The wind is named by where it comes from, so it blows towards the opposite side: from
  // twelve o'clock it blows back down the range, from nine o'clock it pushes to the right.
  // It is taken along and across the line of sight; on a slope the small part of a head or
  // tail wind that would cross the line vertically is left out, as vertical wind is.
  const windRadians = (windFromDegrees * Math.PI) / 180;
  const parts = {
    dragModel: input.dragModel,
    ballisticCoefficient: input.ballisticCoefficient,
    sightHeightMeters,
    windX: -windSpeedMs * Math.cos(windRadians),
    windZ: -windSpeedMs * Math.sin(windRadians),
    conditions,
    timeStepSeconds,
  };
  const zeroShot = makeShot({ ...parts, muzzleSpeedMs: zeroMuzzleSpeedMs, inclineRadians: 0 });
  const zeroAngleRadians = sightIn(zeroShot, zeroDistanceMeters);
  if (zeroAngleRadians === null) return null;
  return {
    conditions,
    massKg,
    muzzleSpeedMs,
    zeroMuzzleSpeedMs,
    zeroDistanceMeters,
    zeroAngleRadians,
    vitalRadiusMeters,
    windSpeedMs,
    windFromDegrees,
    shot: makeShot({ ...parts, muzzleSpeedMs, inclineRadians: (inclineDegrees * Math.PI) / 180 }),
    levelShot: makeShot({ ...parts, muzzleSpeedMs, inclineRadians: 0 }),
  };
}

function toRow(sample: State, distanceMeters: number, prepared: Prepared, shot: Shot): TrajectoryRow {
  const dropMeters = -sample.y;
  const driftMeters = sample.z;
  const speedMs = Math.hypot(sample.vx, sample.vy, sample.vz);
  return {
    distanceMeters,
    dropMeters,
    dropMoa: angleOf(dropMeters, distanceMeters) / MOA_RADIANS,
    dropMil: angleOf(dropMeters, distanceMeters) / MIL_RADIANS,
    driftMeters,
    driftMoa: angleOf(driftMeters, distanceMeters) / MOA_RADIANS,
    driftMil: angleOf(driftMeters, distanceMeters) / MIL_RADIANS,
    speedMs,
    // Drag was read at the speed through the air, so the Mach shown is that speed and not
    // the speed over the ground; in a head or tail wind the two are not the same number.
    mach: airspeed(sample, shot) / prepared.conditions.speedOfSoundMs,
    energyJoules: 0.5 * prepared.massKg * speedMs ** 2,
    timeSeconds: sample.t,
  };
}

export function calculateTrajectory(input: TrajectoryInput): TrajectoryResult | null {
  const prepared = prepare(input);
  if (prepared === null) return null;
  const { shot } = prepared;

  const { meters: distances, truncated } = sampleDistances(input);
  const limitMeters = Math.max(distances[distances.length - 1] ?? 0, prepared.zeroDistanceMeters);
  const flight = fly(shot, prepared.zeroAngleRadians, { samples: distances, limitMeters });
  const rows: TrajectoryRow[] = [];
  for (const [index, distanceMeters] of distances.entries()) {
    const sample = flight.samples[index];
    if (sample === null || sample === undefined) continue;
    rows.push(toRow(sample, distanceMeters, prepared, shot));
  }

  // Sighted in on the level: a point blank range is a way to zero a rifle, not a slope's answer.
  const pointBlank = solvePointBlank(prepared.levelShot, prepared.vitalRadiusMeters);
  return {
    conditions: prepared.conditions,
    muzzleSpeedMs: prepared.muzzleSpeedMs,
    zeroMuzzleSpeedMs: prepared.zeroMuzzleSpeedMs,
    muzzleEnergyJoules: 0.5 * prepared.massKg * prepared.muzzleSpeedMs ** 2,
    massKg: prepared.massKg,
    zeroAngleRadians: prepared.zeroAngleRadians,
    zeroDistanceMeters: prepared.zeroDistanceMeters,
    nearZeroMeters: flight.nearZeroMeters,
    farZeroMeters: flight.farZeroMeters,
    // A zero short of the top of the arc is the crossing on the way up, not the one on the way down.
    zeroSide: prepared.zeroDistanceMeters < flight.apex.distanceMeters ? 'rising' : 'falling',
    apex: flight.apex,
    rows,
    truncated,
    reachedMeters: flight.reachedMeters,
    pointBlank: typeof pointBlank === 'string' ? null : pointBlank,
    pointBlankUnavailable: typeof pointBlank === 'string' ? pointBlank : null,
    windFromDegrees: prepared.windFromDegrees,
    windSpeedMs: prepared.windSpeedMs,
  };
}

/**
 * The same trajectory read at any distances, in any order, with no row limit.
 *
 * The table stops at a fixed number of rows because it is read by a person. A figure that has to
 * be looked for between the rows - the furthest distance at which a hit is still likely enough -
 * needs the path far more finely than that, and it needs it again with the velocity changed while
 * the rifle keeps the zero it was given. `muzzleSpeedMs` replaces the velocity of the day for this
 * flight only; the zero is still the one solved for the input. An entry is null where the bullet
 * never got that far.
 */
export function sampleTrajectory(
  input: TrajectoryInput,
  distancesMeters: readonly number[],
  overrides: TrajectoryVariant = {},
): (TrajectoryRow | null)[] | null {
  return sampleTrajectoryVariants(input, distancesMeters, [overrides])?.[0] ?? null;
}

/**
 * A change to one flight of an already sighted-in rifle: another velocity, or a full value
 * crosswind from nine o'clock of this many m/s in place of the day's wind.
 */
export interface TrajectoryVariant {
  muzzleSpeedMs?: number;
  crosswindMs?: number;
}

/**
 * Several flights of the same rifle, solved for its zero once.
 *
 * The zero solve flies the bullet many times over; a caller that wants the same load at a second
 * velocity and in a second wind should not pay for it again. Each variant keeps the zero of the
 * input and changes only what it names.
 */
export function sampleTrajectoryVariants(
  input: TrajectoryInput,
  distancesMeters: readonly number[],
  variants: readonly TrajectoryVariant[],
): (TrajectoryRow | null)[][] | null {
  const prepared = prepare(input);
  if (prepared === null) return null;
  if (!distancesMeters.every((meters) => Number.isFinite(meters) && meters > 0)) return null;
  const order = distancesMeters.map((meters, index) => ({ meters, index })).sort((a, b) => a.meters - b.meters);
  const ascending = order.map((entry) => entry.meters);
  const flights: (TrajectoryRow | null)[][] = [];
  for (const variant of variants) {
    const muzzleSpeedMs = variant.muzzleSpeedMs ?? prepared.muzzleSpeedMs;
    if (!(muzzleSpeedMs > 0)) return null;
    const crosswind = variant.crosswindMs;
    if (crosswind !== undefined && !Number.isFinite(crosswind)) return null;
    // From nine o'clock the wind blows to the shooter's right, which is +z.
    const shot: Shot = {
      ...prepared.shot,
      muzzleSpeedMs,
      ...(crosswind === undefined ? {} : { windX: 0, windZ: crosswind }),
    };
    const flight = fly(shot, prepared.zeroAngleRadians, {
      samples: ascending,
      limitMeters: ascending[ascending.length - 1] ?? 0,
    });
    const rows: (TrajectoryRow | null)[] = distancesMeters.map(() => null);
    for (const [position, entry] of order.entries()) {
      const sample = flight.samples[position];
      if (sample !== null && sample !== undefined) rows[entry.index] = toRow(sample, entry.meters, prepared, shot);
    }
    flights.push(rows);
  }
  return flights;
}

/**
 * An offset on the target in clicks of a sight, unrounded.
 *
 * The same division the sight adjustment tool makes: the offset over the travel of one click at
 * that distance, which for an angular click is distance × tan(click). A turret only stops on whole
 * clicks, so the screen rounds this.
 */
export function offsetInClicks(offsetMeters: number, distanceMeters: number, click: ClickSetting): number {
  const size = clickSizeMm(click, distanceMeters);
  return Number.isFinite(size) && size > 0 ? (offsetMeters * 1000) / size : NaN;
}

/**
 * The longest shot that needs no holdover.
 *
 * Sight the rifle so the bullet rises exactly to the top of the target circle and never
 * higher; the point blank range is then where it leaves that circle again. The zero that
 * belongs to it is the far crossing of the line of sight, the distance to sight in at.
 *
 * The sighting is worked out in still air on purpose. A zero is set at the range, days or
 * months before the shot, and nobody re-zeroes for the wind of an afternoon, so a figure
 * that moved with the wind would not be the figure a shooter sights in by. The wind that
 * was entered is applied afterwards, to the same zero, and reported beside it: it is the
 * honest answer to how far the bullet really stays inside the circle today.
 *
 * A scope mounted further above the bore than the circle is wide leaves the bullet outside
 * the circle at the muzzle, where no sighting can put it back, so there is no such range.
 */
function solvePointBlank(shot: Shot, radiusMeters: number): PointBlankResult | PointBlankUnavailable {
  if (shot.sightHeightMeters > radiusMeters) return 'sight-above-radius';
  const stillAir: Shot = { ...shot, windX: 0, windZ: 0 };
  const run = (target: Shot, angle: number) =>
    fly(target, angle, { limitMeters: Number.POSITIVE_INFINITY, circleRadiusMeters: radiusMeters });
  // In a vacuum a bullet launched at θ tops out at v²θ²/2g, which puts the first guess close.
  const guess = Math.sqrt(2 * STANDARD_GRAVITY * (radiusMeters + shot.sightHeightMeters)) / shot.muzzleSpeedMs;
  // A hundredth of a millimetre of apex height, far tighter than the radius it is matched to.
  const angle = solveRising((candidate) => run(stillAir, candidate).apex.heightMeters, radiusMeters, guess, 0.00001);
  if (angle === null) return 'unsolved';
  const flight = run(stillAir, angle);
  if (flight.circleExitMeters === null || flight.farZeroMeters === null) return 'unsolved';
  return {
    rangeMeters: flight.circleExitMeters,
    zeroMeters: flight.farZeroMeters,
    apex: flight.apex,
    windLimitedRangeMeters: run(shot, angle).circleExitMeters,
  };
}

/** Muzzle energy on its own, for the check that needs nothing but a weight and a chronograph. */
export function muzzleEnergy(
  mass: { value: number; unit: MassUnit },
  speed: { value: number; unit: SpeedUnit },
): { joules: number; footPounds: number } | null {
  const massKg = toKilograms(mass.value, mass.unit);
  const speedMs = toMetersPerSecond(speed.value, speed.unit);
  if (!(massKg > 0) || !(speedMs > 0)) return null;
  const joules = 0.5 * massKg * speedMs ** 2;
  return { joules, footPounds: joules / JOULES_PER_FOOT_POUND };
}

/* ------------------------------------------------------------------ *
 * Working backwards from shots that were actually fired
 * ------------------------------------------------------------------ */

/**
 * A load described the way a load is described, without the table read off it.
 *
 * The trajectory tool asks what a load will do. Two other tools ask the opposite: which load
 * explains the holes in the target, and how far apart a velocity that changes from shot to
 * shot pushes those holes. Both need the drop at distances of their own choosing, and one of
 * them needs it at a departure angle it sets itself, so both are built on this rather than on
 * the table `calculateTrajectory` prints.
 *
 * There is no wind here. A crosswind moves a bullet sideways and leaves the drop alone to far
 * less than either tool can measure, and the head or tail wind that would change it is not
 * something a shooter records beside a group.
 */
export interface ShotDescription {
  muzzleSpeed: { value: number; unit: SpeedUnit };
  ballisticCoefficient: number;
  dragModel: DragModel;
  sightHeight: { value: number; unit: SightHeightUnit };
  atmosphere: AtmosphereInput;
  /** Only the tests set this, to show that the answer stops moving as the step shrinks. */
  timeStepSeconds?: number;
}

export interface DropSample {
  distanceMeters: number;
  /** Below the line of sight is positive, as on every printed drop chart. */
  dropMeters: number;
  speedMs: number;
  timeSeconds: number;
}

/** The description in SI, or null when it does not describe a shot that can be fired. */
function resolveShot(shot: ShotDescription): Shot | null {
  const conditions = resolveConditions(shot.atmosphere);
  if (conditions === null) return null;
  const muzzleSpeedMs = toMetersPerSecond(shot.muzzleSpeed.value, shot.muzzleSpeed.unit);
  const sightHeightMeters = sightHeightToMeters(shot.sightHeight.value, shot.sightHeight.unit);
  const timeStepSeconds = shot.timeStepSeconds ?? TIME_STEP_SECONDS;
  if (!(muzzleSpeedMs > 0) || !(shot.ballisticCoefficient > 0) || !(sightHeightMeters >= 0)) return null;
  if (!(timeStepSeconds > 0) || timeStepSeconds > MAX_TIME_STEP_SECONDS) return null;
  return makeShot({
    dragModel: shot.dragModel,
    ballisticCoefficient: shot.ballisticCoefficient,
    muzzleSpeedMs,
    sightHeightMeters,
    windX: 0,
    windZ: 0,
    inclineRadians: 0,
    conditions,
    timeStepSeconds,
  });
}

/**
 * The angle the bore is above the line of sight for a rifle zeroed at this distance.
 *
 * It is handed back rather than used on the spot because a rifle is zeroed once and then
 * fired with whatever velocity each round happens to leave at. Sighting in again for every
 * velocity would make the shots agree at the zero distance by construction, which is the one
 * thing the spread of a chronograph reading is not allowed to do.
 */
export function departureAngle(shot: ShotDescription, zeroDistanceMeters: number): number | null {
  const resolved = resolveShot(shot);
  if (resolved === null || !(zeroDistanceMeters > 0)) return null;
  return sightIn(resolved, zeroDistanceMeters);
}

/**
 * Drop at each distance asked for, for a shot let off at a given departure angle.
 *
 * The entries come back in the order they were asked for; one is null where the bullet never
 * reached that distance. The distances are sorted for the integration and put back afterwards,
 * so a caller may list them in any order.
 */
export function dropsAtAngle(
  shot: ShotDescription,
  angleRadians: number,
  distancesMeters: readonly number[],
): (DropSample | null)[] | null {
  const resolved = resolveShot(shot);
  if (resolved === null || !Number.isFinite(angleRadians)) return null;
  if (distancesMeters.length === 0) return [];
  if (!distancesMeters.every((meters) => Number.isFinite(meters) && meters > 0)) return null;

  const order = distancesMeters.map((meters, index) => ({ meters, index })).sort((a, b) => a.meters - b.meters);
  const ascending = order.map((entry) => entry.meters);
  const limitMeters = ascending[ascending.length - 1] ?? 0;
  const flight = fly(resolved, angleRadians, { samples: ascending, limitMeters });
  const samples: (DropSample | null)[] = distancesMeters.map(() => null);
  for (const [position, entry] of order.entries()) {
    const state = flight.samples[position];
    if (state === null || state === undefined) continue;
    samples[entry.index] = {
      distanceMeters: entry.meters,
      dropMeters: -state.y,
      speedMs: Math.hypot(state.vx, state.vy, state.vz),
      timeSeconds: state.t,
    };
  }
  return samples;
}

/** Drop at each distance for a rifle zeroed at `zeroDistanceMeters`, sighted in for this load. */
export function dropsFromZero(
  shot: ShotDescription,
  zeroDistanceMeters: number,
  distancesMeters: readonly number[],
): (DropSample | null)[] | null {
  const angleRadians = departureAngle(shot, zeroDistanceMeters);
  if (angleRadians === null) return null;
  return dropsAtAngle(shot, angleRadians, distancesMeters);
}
