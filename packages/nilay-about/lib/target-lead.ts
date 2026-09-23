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
 * What the model leaves out: the projectile flies straight at a single speed, the average the
 * shooter enters, so there is no drag curve, no bullet drop and no wind. The target holds its speed
 * and heading throughout, and a shot charge counts as one point rather than a string with length and
 * a spread in arrival time. The table reuses the entered average at every range, while a real
 * projectile has slowed by the longer rows and would want a little more lead there than it shows.
 *
 * Unit definitions come through `lib/sight-adjustment`, from the 1959 international yard and pound
 * agreement: 1 yd = 0.9144 m and 1 in = 25.4 mm, both exact. The international mile is 1760 yd and
 * the international foot is a third of a yard, so both follow from the same constant. MOA and mil
 * are the angular units defined there too, mil being the milliradian rather than the NATO mil.
 */

import type { DistanceUnit } from './schemas/sight-adjustment';
import type { ProjectileSpeedUnit, SpeedUnit, TargetSpeedUnit } from './schemas/target-lead';
import { METERS_PER_YARD, MIL_RADIANS, MM_PER_INCH, MOA_RADIANS, toMeters } from './sight-adjustment';

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

export interface TargetLeadInput {
  targetSpeed: { value: number; unit: TargetSpeedUnit };
  distance: { value: number; unit: DistanceUnit };
  /** 0 is a target coming straight on, 90 one crossing square, 180 one going straight away. */
  crossingAngleDegrees: number;
  projectileSpeed: { value: number; unit: ProjectileSpeedUnit };
  delaySeconds: number;
}

export interface TargetLeadResult {
  distanceMeters: number;
  targetSpeedMps: number;
  projectileSpeedMps: number;
  /** Time the projectile is in the air: the meeting time less the delay. */
  flightSeconds: number;
  delaySeconds: number;
  /** Time the target moves between the trigger being pulled and the hit. */
  totalSeconds: number;
  /** Ground the target covers in that time, which is the gap between it and the point to aim at. */
  lead: LeadLengths;
  /** The part of that gap laid across the line of sight, which is what the swing covers. */
  crossLead: LeadLengths;
  /** Range to the interception point, which is not the range to the target. */
  interceptDistanceMeters: number;
  angleRadians: number;
  angleDegrees: number;
  moa: number;
  mil: number;
}

export type TargetLeadOutcome =
  | { kind: 'lead'; result: TargetLeadResult }
  /** A figure is missing, out of range, or not one the geometry can use. */
  | { kind: 'incomplete' }
  /** Every figure is usable, but the projectile never reaches the target. */
  | { kind: 'unreachable' };

export function calculateTargetLead(settings: TargetLeadInput): TargetLeadOutcome {
  const distanceMeters = toMeters(settings.distance.value, settings.distance.unit);
  const projectileSpeedMps = toMetersPerSecond(settings.projectileSpeed.value, settings.projectileSpeed.unit);
  const targetSpeedMps = toMetersPerSecond(settings.targetSpeed.value, settings.targetSpeed.unit);
  const { crossingAngleDegrees, delaySeconds } = settings;
  const incomplete = { kind: 'incomplete' } as const;
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) return incomplete;
  // A projectile that does not move never arrives, however long anyone waits for it.
  if (!Number.isFinite(projectileSpeedMps) || projectileSpeedMps <= 0) return incomplete;
  // Zero is a target standing still and leads by nothing; a negative speed is not a question.
  if (!Number.isFinite(targetSpeedMps) || targetSpeedMps < 0) return incomplete;
  if (!Number.isFinite(crossingAngleDegrees) || crossingAngleDegrees < 0 || crossingAngleDegrees > 180)
    return incomplete;
  if (!Number.isFinite(delaySeconds) || delaySeconds < 0) return incomplete;

  const crossingRadians = crossingAngleDegrees * DEGREES_TO_RADIANS;
  // Signed along the line of sight, away from the shooter: negative below 90 degrees, where the
  // target is closing, and positive above it. This is r·v divided by the range.
  const alongSpeedMps = -targetSpeedMps * Math.cos(crossingRadians);
  const crossSpeedMps = targetSpeedMps * Math.sin(crossingRadians);
  const times = quadraticRoots(
    targetSpeedMps ** 2 - projectileSpeedMps ** 2,
    2 * (distanceMeters * alongSpeedMps + projectileSpeedMps ** 2 * delaySeconds),
    distanceMeters ** 2 - (projectileSpeedMps * delaySeconds) ** 2,
    // Only a meeting after the shot leaves is a meeting; squaring the equation admits earlier roots
    // where the projectile would have had to travel backwards in time to be there.
  ).filter((time) => time > delaySeconds);
  if (times.length === 0) return { kind: 'unreachable' };

  // The first meeting is the one that happens: the shot cannot pass through the target to reach a later one.
  const totalSeconds = Math.min(...times);
  const flightSeconds = totalSeconds - delaySeconds;
  const along = distanceMeters + alongSpeedMps * totalSeconds;
  const cross = crossSpeedMps * totalSeconds;
  // atan2 rather than the arc cosine of the dot product: the swing is a small angle in almost every
  // shot, and the arc cosine loses most of its digits there.
  const angleRadians = Math.atan2(cross, along);
  return {
    kind: 'lead',
    result: {
      distanceMeters,
      targetSpeedMps,
      projectileSpeedMps,
      flightSeconds,
      delaySeconds,
      totalSeconds,
      lead: leadLengths(targetSpeedMps * totalSeconds),
      crossLead: leadLengths(cross),
      interceptDistanceMeters: projectileSpeedMps * flightSeconds,
      angleRadians,
      angleDegrees: angleRadians / DEGREES_TO_RADIANS,
      moa: angleRadians / MOA_RADIANS,
      mil: angleRadians / MIL_RADIANS,
    },
  };
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
  const outcome = calculateTargetLead(settings);
  if (outcome.kind !== 'lead') return [];
  return LEAD_TABLE_DISTANCE_FACTORS.map((factor) => {
    const distanceMeters = outcome.result.distanceMeters * factor;
    return {
      distanceMeters,
      current: factor === 1,
      cells: LEAD_TABLE_ANGLES_DEGREES.map((angleDegrees) => {
        // Every cell is the whole meeting solved again, because the angle changes the flight as well
        // as the part of the lead that crosses the sight line.
        const cell = calculateTargetLead({
          ...settings,
          distance: { value: distanceMeters, unit: 'm' },
          crossingAngleDegrees: angleDegrees,
        });
        return { angleDegrees, crossLeadMeters: cell.kind === 'lead' ? cell.result.crossLead.meters : null };
      }),
    };
  });
}
