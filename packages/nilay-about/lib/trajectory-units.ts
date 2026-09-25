import { MM_PER_INCH } from './sight-adjustment';
import {
  GRAMS_PER_GRAIN,
  METERS_PER_FOOT,
  METERS_PER_SECOND_PER_MPH,
  PASCALS_PER_INCH_OF_MERCURY,
  altitudeInRange,
  altitudeRange,
  type AltitudeUnit,
  type MassUnit,
  type PowderSensitivityUnit,
  type PressureUnit,
  type SightHeightUnit,
  type SpeedUnit,
  type TemperatureUnit,
  type WindSpeedUnit,
} from './trajectory';

/**
 * Rewriting a measured quantity when the unit it is shown in changes.
 *
 * A velocity, a weight, a sight height, a wind or a barometer reading is a property of the
 * load or of the day, so picking another unit has to say the same thing another way. Keeping
 * the number would quietly describe another load: 800 m/s read as 800 fps is a different
 * rifle. The distances the table is laid out in are not measurements and are left alone.
 *
 * The decimals are fine enough that the rewritten figure stands for the same quantity and
 * coarse enough to read in a field. Moving a unit back and forth can shift the last digit.
 */
function round(value: number, decimals: number): number {
  // A field that is still being typed can be empty, and it has to stay empty across a change.
  if (!Number.isFinite(value)) return value;
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
}

export function convertSpeedValue(value: number, from: SpeedUnit, to: SpeedUnit): number {
  if (from === to) return value;
  return round(to === 'fps' ? value / METERS_PER_FOOT : value * METERS_PER_FOOT, 1);
}

export function convertMassValue(value: number, from: MassUnit, to: MassUnit): number {
  if (from === to) return value;
  return to === 'grain' ? round(value / GRAMS_PER_GRAIN, 2) : round(value * GRAMS_PER_GRAIN, 3);
}

export function convertSightHeightValue(value: number, from: SightHeightUnit, to: SightHeightUnit): number {
  if (from === to) return value;
  return to === 'inch' ? round(value / MM_PER_INCH, 3) : round(value * MM_PER_INCH, 1);
}

export function convertWindSpeedValue(value: number, from: WindSpeedUnit, to: WindSpeedUnit): number {
  if (from === to) return value;
  return round(to === 'mph' ? value / METERS_PER_SECOND_PER_MPH : value * METERS_PER_SECOND_PER_MPH, 1);
}

export function convertTemperatureValue(value: number, from: TemperatureUnit, to: TemperatureUnit): number {
  if (from === to) return value;
  return round(to === 'f' ? (value * 9) / 5 + 32 : ((value - 32) * 5) / 9, 1);
}

export function convertPressureValue(value: number, from: PressureUnit, to: PressureUnit): number {
  if (from === to) return value;
  return to === 'inhg'
    ? round((value * 100) / PASCALS_PER_INCH_OF_MERCURY, 3)
    : round((value * PASCALS_PER_INCH_OF_MERCURY) / 100, 2);
}

export function convertAltitudeValue(value: number, from: AltitudeUnit, to: AltitudeUnit): number {
  if (from === to) return value;
  const converted = round(to === 'ft' ? value / METERS_PER_FOOT : value * METERS_PER_FOOT, 0);
  // Rounding can carry an accepted height just past a limit: 9000 m is 29527.6 ft, and 29528 ft
  // is over it. A value that was inside the range stays inside it.
  if (!altitudeInRange(value, from) || altitudeInRange(converted, to)) return converted;
  const { min, max } = altitudeRange(to);
  return Math.min(max, Math.max(min, converted));
}

/** A velocity change per degree: fps per °F is 0.3048 m/s per 5/9 K, or 0.54864 m/s per °C. */
export function convertPowderSensitivityValue(
  value: number,
  from: PowderSensitivityUnit,
  to: PowderSensitivityUnit,
): number {
  if (from === to) return value;
  const factor = (METERS_PER_FOOT * 9) / 5;
  return round(to === 'fps-per-f' ? value / factor : value * factor, 3);
}
