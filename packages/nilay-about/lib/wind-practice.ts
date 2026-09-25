/**
 * Practice at turning a wind into a hold.
 *
 * Two kinds of question, both worked out rather than looked up:
 *
 *   - value: how much of a wind from this hour of the clock pushes across the line of fire. A
 *     wind from 3 or 9 o'clock is full value, from 12 or 6 none, and from anywhere else the sine
 *     of its angle to the line of fire, as the trajectory tool resolves it.
 *   - hold: how far to hold into the wind for this speed, hour and distance, with the drift of the
 *     shooter's own load worked out by the trajectory tool's model.
 *
 * The questions are drawn from a random source passed in, so a test can fix them.
 */

import { toMeters, type DistanceUnit } from './sight-adjustment';
import {
  calculateTrajectory,
  windToMetersPerSecond,
  type DragModel,
  type SpeedUnit,
  type WindSpeedUnit,
} from './trajectory';

export const CLOCK_HOURS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
export type ClockHour = (typeof CLOCK_HOURS)[number];

/** The share of a wind that blows across the line of fire, from the hour it comes from. */
export function windValue(hour: ClockHour): number {
  // Rounded off at the last few bits, so 12 and 6 o'clock read as exactly none.
  return Math.round(Math.abs(Math.sin((hour * Math.PI) / 6)) * 1e12) / 1e12;
}

/** The side to hold on: into the wind. A wind from the right pushes the shot left, so the hold is right. */
export function holdSide(hour: ClockHour): 'left' | 'right' | null {
  if (hour === 12 || hour === 6) return null;
  return hour < 6 ? 'right' : 'left';
}

export type AngleUnit = 'mil' | 'moa';

export interface PracticeLoad {
  muzzleSpeed: { value: number; unit: SpeedUnit };
  ballisticCoefficient: number;
  dragModel: DragModel;
}

/**
 * Drift of a one m/s full value wind at a distance, as an angle in radians.
 *
 * The rest of the rifle is fixed: the dry reference atmosphere on level ground, a 100 m zero and a 40 mm sight
 * height, the trajectory tool's own opening values. Drift hardly depends on the zero or the sight,
 * and the practice is about reading the wind, so those are not asked for.
 */
export function fullValueDriftRadians(load: PracticeLoad, distanceMeters: number): number | null {
  if (!(distanceMeters > 0)) return null;
  const result = calculateTrajectory({
    muzzleSpeed: load.muzzleSpeed,
    mass: { value: 10, unit: 'g' },
    ballisticCoefficient: load.ballisticCoefficient,
    dragModel: load.dragModel,
    sightHeight: { value: 40, unit: 'mm' },
    distanceUnit: 'm',
    zeroDistance: 100,
    step: distanceMeters,
    maxRange: distanceMeters,
    dropUnit: 'cm',
    vitalRadius: 5,
    wind: { speed: 1, unit: 'mps', preset: '9', customFromDegrees: 270 },
    atmosphere: {
      source: 'station',
      temperature: { value: 15, unit: 'c' },
      pressure: { value: 1013.25, unit: 'hpa' },
      altitude: { value: 0, unit: 'm' },
    },
  });
  const row = result?.rows[0];
  if (!row) return null;
  return Math.atan(row.driftMeters / row.distanceMeters);
}

export type WindQuestion =
  { kind: 'value'; hour: ClockHour } | { kind: 'hold'; hour: ClockHour; speed: number; distance: number };

export interface QuestionRange {
  /** Whole units of the wind speed unit on screen. */
  maxSpeed: number;
  /** In the distance unit on screen. */
  minDistance: number;
  maxDistance: number;
  distanceStep: number;
}

const pick = <T>(items: readonly T[], random: () => number): T => {
  const item = items[Math.min(items.length - 1, Math.floor(random() * items.length))];
  if (item === undefined) throw new Error('Nothing to pick from.');
  return item;
};

/** The distances a question may ask about, in the unit on screen. */
export function questionDistances(range: QuestionRange): number[] {
  const { minDistance, maxDistance, distanceStep } = range;
  if (!(minDistance > 0) || !(distanceStep > 0) || !(maxDistance >= minDistance)) return [];
  const count = Math.floor((maxDistance - minDistance) / distanceStep + 1e-9) + 1;
  return Array.from({ length: Math.min(count, 200) }, (_, index) => minDistance + index * distanceStep);
}

export function createQuestion(
  kind: WindQuestion['kind'],
  range: QuestionRange,
  random: () => number,
): WindQuestion | null {
  const hour = pick(CLOCK_HOURS, random);
  if (kind === 'value') return { kind, hour };
  const distances = questionDistances(range);
  if (distances.length === 0 || !(range.maxSpeed >= 1)) return null;
  const speeds = Array.from({ length: Math.floor(range.maxSpeed) }, (_, index) => index + 1);
  return { kind, hour, speed: pick(speeds, random), distance: pick(distances, random) };
}

/** The answer to a hold question: its size in the unit asked for, and its side. */
export function holdAnswer(
  question: Extract<WindQuestion, { kind: 'hold' }>,
  load: PracticeLoad,
  units: { distance: DistanceUnit; wind: WindSpeedUnit; angle: AngleUnit },
): { size: number; side: 'left' | 'right' | null } | null {
  const drift = fullValueDriftRadians(load, toMeters(question.distance, units.distance));
  if (drift === null) return null;
  const speedMs = windToMetersPerSecond(question.speed, units.wind);
  const radians = drift * speedMs * windValue(question.hour);
  const perUnit = units.angle === 'mil' ? 0.001 : Math.PI / 10800;
  return { size: radians / perUnit, side: holdSide(question.hour) };
}

export interface PracticeAttempt {
  kind: WindQuestion['kind'];
  hour: ClockHour;
  correct: boolean;
}

/** Hits and attempts at each hour, so the hours that go wrong most stand out. */
export function attemptsByHour(
  attempts: readonly PracticeAttempt[],
): Record<ClockHour, { attempts: number; correct: number }> {
  const table = Object.fromEntries(CLOCK_HOURS.map((hour) => [hour, { attempts: 0, correct: 0 }])) as Record<
    ClockHour,
    { attempts: number; correct: number }
  >;
  for (const attempt of attempts) {
    const entry = table[attempt.hour];
    entry.attempts += 1;
    if (attempt.correct) entry.correct += 1;
  }
  return table;
}

/** The hours answered least well, worst first; hours not yet asked are left out. */
export function weakestHours(attempts: readonly PracticeAttempt[], count = 3): ClockHour[] {
  const table = attemptsByHour(attempts);
  return CLOCK_HOURS.filter((hour) => table[hour].attempts > 0 && table[hour].correct < table[hour].attempts)
    .sort((a, b) => table[a].correct / table[a].attempts - table[b].correct / table[b].attempts)
    .slice(0, count);
}

/**
 * Whether an answer counts. A share of the wind is judged in percentage points; a hold by its size
 * in the angle unit and by its side, except where the right hold is too small for a side to matter.
 */
export function judgeAnswer(
  expected: { size: number; side: 'left' | 'right' | null },
  answer: { size: number; side: 'left' | 'right' | null },
  tolerance: number,
): boolean {
  if (!Number.isFinite(answer.size) || answer.size < 0) return false;
  if (Math.abs(answer.size - expected.size) > tolerance) return false;
  if (expected.side === null || expected.size <= tolerance) return true;
  return answer.side === expected.side;
}
