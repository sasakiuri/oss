/**
 * Lead for a moving target: how far ahead of it the muzzle has to point.
 *
 * The shot and the target have to be in the same place at the same moment, so the tool solves that
 * meeting rather than approximating it. Put the shooter at the origin, the target at `r` with |r|
 * the range, its velocity at `v`, the projectile's speed at `u` and the delay before the shot leaves
 * at `d`. The target moves for a time `T` that satisfies |r + v T| = u (T - d), which squares to
 *
 *   (|v|² - u²) T² + 2 (r·v + u² d) T + (|r|² - u² d²) = 0
 *
 * and the answer is its smallest root greater than `d`. Where no such root exists the projectile
 * never catches the target and there is no lead to give.
 *
 * The crossing angle runs from 0, a target coming straight on, through 90 for one crossing square,
 * to 180 for one going straight away, so the speed along the line of sight is -|v| cos(angle): a
 * closing target shortens the flight and an opening one lengthens it. That asymmetry is the reason
 * an angle cannot be folded onto its mirror image, even though the two share a crossing component.
 *
 * From the meeting time come the interception point `P = r + v T`, the lead `|P - r| = |v| T`, which
 * is the ground the target covers between the trigger and the hit, and the swing, the angle between
 * `r` and `P`. The part of the lead laid across the line of sight, |v| T sin(angle), is what that
 * angle covers; the rest of it only changes the range. With no delay the swing comes to
 * asin(|v| sin(angle) / u), which does not depend on the range at all.
 *
 * The same holds in three dimensions, which is how a target above the gun or one climbing or
 * dropping is handled: `r` is lifted by the elevation of the line of sight and `v` by the target's
 * climb, and the lead splits into a sideways and an up-and-down part across the line of sight.
 *
 * The speed of the shot comes one of two ways. With `average` the shooter enters the average speed
 * and the shot flies straight at it, with no drop, as above. With `drag` the entered speed is the
 * muzzle velocity and one pellet is flown by `flyPellet` from `./shot-pellets` (sphere drag table,
 * gravity, standard atmosphere), so it slows over the range and falls; the meeting is then found by
 * searching forward in time, and the aiming point is raised by the drop. The pellet is flown along
 * the line the muzzle points on, so fired up or down a slope gravity slows or speeds it along that
 * line and only its part across the line makes the drop. The line depends on the aim and the aim on
 * the drop, so the two are solved in turn until the line stops moving.
 *
 * What the model leaves out: wind, a target that changes speed or heading, and the shot string: a
 * charge counts as one pellet rather than a string with length and a spread in arrival time.
 *
 * Unit definitions come through `lib/sight-adjustment`, from the 1959 international yard and pound
 * agreement: 1 yd = 0.9144 m and 1 in = 25.4 mm, both exact. The international mile is 1760 yd and
 * the international foot is a third of a yard, so both follow from the same constant. MOA and mil
 * are the angular units defined there too, mil being the milliradian rather than the NATO mil.
 */

import type { DistanceUnit } from './schemas/sight-adjustment';
import type { ProjectileSpeedUnit, SpeedUnit, TargetSpeedUnit } from './schemas/target-lead';
import { flyPellet } from './shot-pellets';
import { METERS_PER_YARD, MIL_RADIANS, MM_PER_INCH, MOA_RADIANS, toMeters } from './sight-adjustment';
import { STANDARD_PRESSURE_HPA, STANDARD_TEMPERATURE_CELSIUS, resolveConditions } from './trajectory';

export type { ProjectileSpeedUnit, SpeedUnit, TargetLeadSettings, TargetSpeedUnit } from './schemas/target-lead';

const SECONDS_PER_HOUR = 3600;
const METERS_PER_KILOMETER = 1000;
const YARDS_PER_MILE = 1760;
const FEET_PER_YARD = 3;
const INCHES_PER_FOOT = 12;
const MM_PER_METER = 1000;
const CM_PER_METER = 100;
export const MS_PER_SECOND = 1000;
const DEGREES_TO_RADIANS = Math.PI / 180;

const SPEED_FACTORS: Record<SpeedUnit, number> = {
  'm/s': 1,
  'km/h': METERS_PER_KILOMETER / SECONDS_PER_HOUR,
  mph: (METERS_PER_YARD * YARDS_PER_MILE) / SECONDS_PER_HOUR,
  fps: METERS_PER_YARD / FEET_PER_YARD,
};

export function toMetersPerSecond(value: number, unit: SpeedUnit): number {
  return value * SPEED_FACTORS[unit];
}

/**
 * Real roots of a x² + b x + c, or none.
 *
 * The larger root is formed by adding two values of the same sign, and the other follows from their
 * product c / a, because subtracting two close numbers there would throw away most of the precision.
 */
function quadraticRoots(a: number, b: number, c: number): number[] {
  if (a === 0) return b === 0 ? [] : [-c / b];
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return [];
  const root = Math.sqrt(discriminant);
  const larger = -(b + (b < 0 ? -root : root)) / 2;
  return larger === 0 ? [0] : [larger / a, c / larger];
}

/** One length in the four units a shooter reads it in, so the screen never converts twice. */
export interface LeadLengths {
  meters: number;
  centimetres: number;
  inches: number;
  feet: number;
}

export function leadLengths(meters: number): LeadLengths {
  const inches = (meters * MM_PER_METER) / MM_PER_INCH;
  return { meters, centimetres: meters * CM_PER_METER, inches, feet: inches / INCHES_PER_FOOT };
}

/**
 * How the shot's speed is known.
 *
 * `average`: the shooter enters the average speed over the range, and the shot flies straight at it
 * with no drop. `drag`: the entered speed is the muzzle velocity, and one pellet of the stated
 * diameter and density is flown through the standard atmosphere with the sphere drag table and
 * gravity by `flyPellet` from `./shot-pellets`, so the flight slows and falls as a real pellet does.
 */
export type LeadFlight = { model: 'average' } | { model: 'drag'; diameterMeters: number; densityKgPerM3: number };

export interface TargetLeadInput {
  targetSpeed: { value: number; unit: TargetSpeedUnit };
  distance: { value: number; unit: DistanceUnit };
  /** 0 is a target coming straight on, 90 one crossing square, 180 one going straight away. */
  crossingAngleDegrees: number;
  /** The average speed for `average`, the muzzle velocity for `drag`. */
  projectileSpeed: { value: number; unit: ProjectileSpeedUnit };
  delaySeconds: number;
  /** Height of the target above the horizontal as seen from the gun when the trigger is pulled; 0 when left out. */
  elevationDegrees?: number;
  /** The target's path above the horizontal: positive climbing, negative dropping; 0 when left out. */
  climbDegrees?: number;
  /** `average` when left out. */
  flight?: LeadFlight;
}

export interface TargetLeadResult {
  distanceMeters: number;
  targetSpeedMps: number;
  /** The entered speed: the average for `average`, the muzzle velocity for `drag`. */
  projectileSpeedMps: number;
  /** Time the projectile is in the air: the meeting time less the delay. */
  flightSeconds: number;
  delaySeconds: number;
  /** Time the target moves between the trigger being pulled and the hit. */
  totalSeconds: number;
  /** Ground the target covers in that time, which is the gap between it and the point to aim at. */
  lead: LeadLengths;
  /** The part of the gap to the aiming point that lies sideways, across the line of sight. */
  crossLead: LeadLengths;
  /** The part that lies up (positive) or down (negative), across the line of sight, including any hold for drop. */
  verticalLead: LeadLengths;
  /** Range to the interception point, which is not the range to the target. */
  interceptDistanceMeters: number;
  /** The whole swing from the target to the aiming point. */
  angleRadians: number;
  angleDegrees: number;
  moa: number;
  mil: number;
  /** The swing split into its sideways and its up-and-down part, as the shooter sees them. */
  horizontalDegrees: number;
  verticalDegrees: number;
  /** How far gravity has taken the shot below its line when it arrives; 0 for `average`. */
  dropMeters: number;
  /** Speed of the pellet on arrival; the entered speed for `average`. */
  impactSpeedMps: number;
  /** Path length over flight time: what an `average` entry would have to be to give this answer. */
  averageSpeedMps: number;
}

export type TargetLeadOutcome =
  | { kind: 'lead'; result: TargetLeadResult }
  /** A figure is missing, out of range, or not one the geometry can use. */
  | { kind: 'incomplete' }
  /** Every figure is usable, but the projectile never reaches the target. */
  | { kind: 'unreachable' };

type Vector = readonly [number, number, number];
const dot = (a: Vector, b: Vector) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: Vector) => Math.sqrt(dot(a, a));
const add = (a: Vector, b: Vector): Vector => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vector, k: number): Vector => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a: Vector, b: Vector): Vector => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/** Steepest line of sight or target path the tool accepts: straight up or down has no crossing angle. */
export const MAX_TILT_DEGREES = 85;

/** One pellet's flight, sampled by time, for looking up how far it has gone and fallen after a time t. */
interface PelletPath {
  times: number[];
  distances: number[];
  drops: number[];
  speeds: number[];
}

/** Far enough for any shotgun range; the flight stops sooner if the pellet does. */
const PATH_MAX_METERS = 300;
const PATH_STEP_METERS = 0.25;

/**
 * The standard atmosphere at sea level (15 °C, 1013.25 hPa). The lead tool asks for no weather: the
 * difference it would make is far smaller than the uncertainty in the target's speed and range.
 */
const STANDARD_CONDITIONS = resolveConditions({
  source: 'station',
  temperature: { value: STANDARD_TEMPERATURE_CELSIUS, unit: 'c' },
  pressure: { value: STANDARD_PRESSURE_HPA, unit: 'hpa' },
  altitude: { value: 0, unit: 'm' },
});

function flyPath(
  diameterMeters: number,
  densityKgPerM3: number,
  muzzleSpeedMs: number,
  launchRadians: number,
): PelletPath | null {
  if (!STANDARD_CONDITIONS) return null;
  const distances = Array.from(
    { length: Math.round(PATH_MAX_METERS / PATH_STEP_METERS) + 1 },
    (_, index) => index * PATH_STEP_METERS,
  );
  const rows = flyPellet({ diameterMeters, densityKgPerM3, muzzleSpeedMs }, STANDARD_CONDITIONS, distances, {
    launchRadians,
  });
  if (!rows || rows.length < 2) return null;
  return {
    times: rows.map((row) => row.timeSeconds),
    distances: rows.map((row) => row.distanceMeters),
    drops: rows.map((row) => row.dropMeters),
    speeds: rows.map((row) => row.speedMs),
  };
}

/** Where the pellet is after `t` seconds of flight, or null once it has gone past the sampled path. */
function alongPath(path: PelletPath, t: number): { distance: number; drop: number; speed: number } | null {
  const { times } = path;
  if (t < 0 || t > times[times.length - 1]!) return null;
  let low = 0;
  let high = times.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (times[middle]! <= t) low = middle;
    else high = middle;
  }
  const span = times[high]! - times[low]!;
  const f = span === 0 ? 0 : (t - times[low]!) / span;
  const mix = (values: number[]) => values[low]! + (values[high]! - values[low]!) * f;
  return { distance: mix(path.distances), drop: mix(path.drops), speed: mix(path.speeds) };
}

interface Geometry {
  distanceMeters: number;
  targetSpeedMps: number;
  projectileSpeedMps: number;
  delaySeconds: number;
  /** Target position when the trigger is pulled: x towards it along the ground, y to the side, z up. */
  start: Vector;
  velocity: Vector;
}

function geometry(settings: TargetLeadInput): Geometry | null {
  const distanceMeters = toMeters(settings.distance.value, settings.distance.unit);
  const projectileSpeedMps = toMetersPerSecond(settings.projectileSpeed.value, settings.projectileSpeed.unit);
  const targetSpeedMps = toMetersPerSecond(settings.targetSpeed.value, settings.targetSpeed.unit);
  const { crossingAngleDegrees, delaySeconds } = settings;
  const elevation = settings.elevationDegrees ?? 0;
  const climb = settings.climbDegrees ?? 0;
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) return null;
  // A projectile that does not move never arrives, however long anyone waits for it.
  if (!Number.isFinite(projectileSpeedMps) || projectileSpeedMps <= 0) return null;
  // Zero is a target standing still and leads by nothing; a negative speed is not a question.
  if (!Number.isFinite(targetSpeedMps) || targetSpeedMps < 0) return null;
  if (!Number.isFinite(crossingAngleDegrees) || crossingAngleDegrees < 0 || crossingAngleDegrees > 180) return null;
  if (!Number.isFinite(delaySeconds) || delaySeconds < 0) return null;
  if (!Number.isFinite(elevation) || Math.abs(elevation) > MAX_TILT_DEGREES) return null;
  if (!Number.isFinite(climb) || Math.abs(climb) > MAX_TILT_DEGREES) return null;
  const e = elevation * DEGREES_TO_RADIANS;
  const c = climb * DEGREES_TO_RADIANS;
  const heading = crossingAngleDegrees * DEGREES_TO_RADIANS;
  // The crossing angle is read on the ground: 0 flies at the shooter, 180 away, 90 square across.
  const horizontal = targetSpeedMps * Math.cos(c);
  return {
    distanceMeters,
    targetSpeedMps,
    projectileSpeedMps,
    delaySeconds,
    start: [distanceMeters * Math.cos(e), 0, distanceMeters * Math.sin(e)],
    velocity: [-horizontal * Math.cos(heading), horizontal * Math.sin(heading), targetSpeedMps * Math.sin(c)],
  };
}

/** Meeting time for a shot at a steady speed: the closed form of the header comment, in three dimensions. */
function meetAtAverageSpeed(g: Geometry): number | null {
  const u = g.projectileSpeedMps;
  const d = g.delaySeconds;
  const times = quadraticRoots(
    dot(g.velocity, g.velocity) - u ** 2,
    2 * (dot(g.start, g.velocity) + u ** 2 * d),
    dot(g.start, g.start) - (u * d) ** 2,
    // Only a meeting after the shot leaves is a meeting; squaring the equation admits earlier roots
    // where the projectile would have had to travel backwards in time to be there.
  ).filter((time) => time > d);
  // The first meeting is the one that happens: the shot cannot pass through the target to reach a later one.
  return times.length > 0 ? Math.min(...times) : null;
}

/** Search step for the meeting of a slowing pellet: a millisecond is a few centimetres of target. */
const SEARCH_STEP_SECONDS = 0.001;
const BISECTIONS = 40;

/**
 * Meeting time for a pellet that slows and falls, flown along a line whose upward normal is
 * `lift`. The muzzle is held off the meeting point by the drop along that normal, so the pellet has
 * to cover the distance to that raised point: the first time at which the distance it has flown
 * reaches it is the meeting. The distance flown only grows while the gap changes no faster than the
 * target moves, so stepping forward finds the first crossing, and bisection pins it.
 */
function meetWithDrag(g: Geometry, path: PelletPath, lift: Vector): number | null {
  const gap = (total: number) => {
    const flown = alongPath(path, total - g.delaySeconds);
    if (!flown) return null;
    const aim = add(add(g.start, scale(g.velocity, total)), scale(lift, flown.drop));
    return flown.distance - norm(aim);
  };
  let before = g.delaySeconds;
  for (let total = g.delaySeconds + SEARCH_STEP_SECONDS; ; total += SEARCH_STEP_SECONDS) {
    const value = gap(total);
    if (value === null) return null;
    if (value >= 0) {
      let low = before;
      let high = total;
      for (let step = 0; step < BISECTIONS; step++) {
        const middle = (low + high) / 2;
        if ((gap(middle) ?? -1) >= 0) high = middle;
        else low = middle;
      }
      return high;
    }
    before = total;
  }
}

/** Upward unit normal to a line of fire in the vertical plane through it: where the drop is measured. */
function liftOf(line: Vector): Vector {
  const up = add([0, 0, 1], scale(line, -line[2]));
  return scale(up, 1 / norm(up));
}

/** Elevation of a direction above level. */
const elevationOf = (line: Vector) => Math.atan2(line[2], Math.hypot(line[0], line[1]));

/** Enough rounds of line and drop for any shot the tool accepts; each shrinks the change by far. */
const MAX_LINE_ROUNDS = 20;
/** A line that moves less than this between rounds has settled: a micrometre over a kilometre. */
const LINE_TOLERANCE_RADIANS = 1e-9;

/** The flight of one pellet, flown along the line it is fired on. */
type PathAt = (launchRadians: number) => PelletPath | null;

interface Meeting {
  totalSeconds: number;
  flown: { distance: number; drop: number; speed: number } | null;
  aim: Vector;
}

function meet(g: Geometry, pathAt: PathAt | null): Meeting | 'incomplete' | 'unreachable' {
  if (!pathAt) {
    const totalSeconds = meetAtAverageSpeed(g);
    if (totalSeconds === null) return 'unreachable';
    return { totalSeconds, flown: null, aim: add(g.start, scale(g.velocity, totalSeconds)) };
  }
  let line = scale(g.start, 1 / g.distanceMeters);
  for (let round = 0; round < MAX_LINE_ROUNDS; round++) {
    const path = pathAt(elevationOf(line));
    if (!path) return 'incomplete';
    const lift = liftOf(line);
    const totalSeconds = meetWithDrag(g, path, lift);
    if (totalSeconds === null) return 'unreachable';
    const flown = alongPath(path, totalSeconds - g.delaySeconds);
    if (!flown) return 'unreachable';
    const aim = add(add(g.start, scale(g.velocity, totalSeconds)), scale(lift, flown.drop));
    const next = scale(aim, 1 / norm(aim));
    const moved = Math.atan2(norm(cross(line, next)), dot(line, next));
    line = next;
    if (moved < LINE_TOLERANCE_RADIANS) return { totalSeconds, flown, aim };
  }
  return 'unreachable';
}

function solve(settings: TargetLeadInput, pathAt: PathAt | null): TargetLeadOutcome {
  const g = geometry(settings);
  const flight = settings.flight ?? { model: 'average' };
  if (!g) return { kind: 'incomplete' };
  if (flight.model === 'drag' && !pathAt) return { kind: 'incomplete' };
  const meeting = meet(g, flight.model === 'drag' ? pathAt : null);
  if (meeting === 'incomplete') return { kind: 'incomplete' };
  if (meeting === 'unreachable') return { kind: 'unreachable' };
  const { totalSeconds, flown, aim } = meeting;
  const flightSeconds = totalSeconds - g.delaySeconds;
  const dropMeters = flown?.drop ?? 0;
  const gapToAim = add(aim, scale(g.start, -1));
  const sight = scale(g.start, 1 / g.distanceMeters);
  // Unit vectors across the line of sight: sideways on the ground, and up in the vertical plane.
  const side: Vector = [0, 1, 0];
  const up: Vector = [-sight[2], 0, sight[0]];
  // The two parts of the swing as the shooter sees them, looking along the line of sight to the target.
  const horizontalRadians = Math.atan2(dot(aim, side), dot(aim, sight));
  const verticalRadians = Math.atan2(dot(aim, up), dot(aim, sight));
  // atan2 rather than the arc cosine of the dot product: the swing is a small angle in almost every
  // shot, and the arc cosine loses most of its digits there.
  const angleRadians = Math.atan2(norm(cross(sight, aim)), dot(sight, aim));
  const interceptDistanceMeters = flown ? flown.distance : g.projectileSpeedMps * flightSeconds;
  return {
    kind: 'lead',
    result: {
      distanceMeters: g.distanceMeters,
      targetSpeedMps: g.targetSpeedMps,
      projectileSpeedMps: g.projectileSpeedMps,
      flightSeconds,
      delaySeconds: g.delaySeconds,
      totalSeconds,
      lead: leadLengths(g.targetSpeedMps * totalSeconds),
      crossLead: leadLengths(dot(gapToAim, side)),
      verticalLead: leadLengths(dot(gapToAim, up)),
      interceptDistanceMeters,
      angleRadians,
      angleDegrees: angleRadians / DEGREES_TO_RADIANS,
      moa: angleRadians / MOA_RADIANS,
      mil: angleRadians / MIL_RADIANS,
      horizontalDegrees: horizontalRadians / DEGREES_TO_RADIANS,
      verticalDegrees: verticalRadians / DEGREES_TO_RADIANS,
      dropMeters,
      impactSpeedMps: flown ? flown.speed : g.projectileSpeedMps,
      averageSpeedMps: flightSeconds > 0 ? interceptDistanceMeters / flightSeconds : g.projectileSpeedMps,
    },
  };
}

/**
 * The pellet's own flight, which depends on the pellet and the line it is fired on but not on where
 * the target is. Flights already flown are kept, so a table of shots reuses them.
 */
function pathFor(settings: TargetLeadInput): PathAt | null {
  const flight = settings.flight;
  if (flight?.model !== 'drag') return null;
  const muzzle = toMetersPerSecond(settings.projectileSpeed.value, settings.projectileSpeed.unit);
  if (![flight.diameterMeters, flight.densityKgPerM3, muzzle].every((value) => Number.isFinite(value) && value > 0))
    return null;
  const flown = new Map<number, PelletPath | null>();
  return (launchRadians) => {
    if (!flown.has(launchRadians))
      flown.set(launchRadians, flyPath(flight.diameterMeters, flight.densityKgPerM3, muzzle, launchRadians));
    return flown.get(launchRadians) ?? null;
  };
}

export function calculateTargetLead(settings: TargetLeadInput): TargetLeadOutcome {
  return solve(settings, pathFor(settings));
}

/** Half and half again of the entered range, which is enough to show the lead growing with distance. */
export const LEAD_TABLE_DISTANCE_FACTORS = [0.5, 1, 1.5] as const;
/** A target closing at 30, one at 60 and one crossing square, which is the range a shot covers. */
export const LEAD_TABLE_ANGLES_DEGREES = [30, 60, 90] as const;

export interface LeadTableCell {
  angleDegrees: number;
  /**
   * The lead across the line of sight, which is what the shooter holds off by. The lead along the
   * target's own path barely moves with the angle, because it is mostly the flight time times the
   * speed, so tabulating that would suggest the angle hardly mattered. Null where nothing catches
   * the target at that angle.
   */
  crossLeadMeters: number | null;
}

export interface LeadTableRow {
  distanceMeters: number;
  /** The row at the range in the form, so the table can point back at the shot being asked about. */
  current: boolean;
  cells: LeadTableCell[];
}

export function leadTable(settings: TargetLeadInput): LeadTableRow[] {
  // The pellet's flight does not depend on where the target is, so the flights are shared by every cell.
  const path = pathFor(settings);
  const outcome = solve(settings, path);
  if (outcome.kind !== 'lead') return [];
  return LEAD_TABLE_DISTANCE_FACTORS.map((factor) => {
    const distanceMeters = outcome.result.distanceMeters * factor;
    return {
      distanceMeters,
      current: factor === 1,
      cells: LEAD_TABLE_ANGLES_DEGREES.map((angleDegrees) => {
        // Every cell is the whole meeting solved again, because the angle changes the flight as well
        // as the part of the lead that crosses the sight line.
        const cell = solve(
          { ...settings, distance: { value: distanceMeters, unit: 'm' }, crossingAngleDegrees: angleDegrees },
          path,
        );
        return { angleDegrees, crossLeadMeters: cell.kind === 'lead' ? cell.result.crossLead.meters : null };
      }),
    };
  });
}
