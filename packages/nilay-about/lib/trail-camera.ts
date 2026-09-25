/**
 * When animals came past a trail camera, from the times its photos were taken: by hour and date,
 * by hours from sunrise and sunset, and by the age of the moon.
 *
 * The photos' own times are wall-clock times in whatever zone the camera was set to. The reader
 * says what that zone is (Japan by default) and how far the camera clock was off; the counts are
 * then made on the corrected times.
 */

import type { ExifTime } from './exif';
import { getSunTimes, moonAge } from './solar';

export interface CameraPhoto {
  name: string;
  time: ExifTime;
}

export interface CameraSettings {
  /** Minutes east of UTC the camera clock was set to, for photos that do not say. */
  zoneOffsetMinutes: number;
  /** Minutes to add to every photo's time, to undo a camera clock that was fast or slow. */
  clockCorrectionMinutes: number;
  /** Where the camera stands, for sunrise and sunset; null leaves those counts out. */
  location: { latitude: number; longitude: number } | null;
}

/** The instant a photo was taken, after the clock correction. */
export function photoInstant(time: ExifTime, settings: CameraSettings): Date {
  const offset = time.offsetMinutes ?? settings.zoneOffsetMinutes;
  const wall = Date.UTC(time.year, time.month - 1, time.day, time.hour, time.minute, time.second);
  return new Date(wall - offset * 60000 + settings.clockCorrectionMinutes * 60000);
}

/** The wall-clock date and hour of an instant in the camera's zone. */
function localParts(instant: Date, offsetMinutes: number) {
  const shifted = new Date(instant.getTime() + offsetMinutes * 60000);
  return {
    date: `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`,
    calendar: { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() },
    hour: shifted.getUTCHours(),
  };
}

/** Eight phases of about 3.7 days each, from new moon. */
export const MOON_PHASE_BINS = 8;

export interface CameraSummary {
  total: number;
  /** Dates in order, each with 24 hourly counts. */
  byDateHour: { date: string; hours: number[] }[];
  byHour: number[];
  /** Photos per whole hour after sunrise (negative: before), and after sunset. Keys are hours. */
  fromSunrise: Map<number, number>;
  fromSunset: Map<number, number>;
  /** Photos taken on days the sun did not rise or set there. */
  withoutSunEvent: number;
  byMoonPhase: number[];
}

export function summarise(photos: readonly CameraPhoto[], settings: CameraSettings): CameraSummary {
  const byDate = new Map<string, number[]>();
  const byHour = Array.from({ length: 24 }, () => 0);
  const fromSunrise = new Map<number, number>();
  const fromSunset = new Map<number, number>();
  const byMoonPhase = Array.from({ length: MOON_PHASE_BINS }, () => 0);
  let withoutSunEvent = 0;
  for (const photo of photos) {
    const offset = photo.time.offsetMinutes ?? settings.zoneOffsetMinutes;
    const instant = photoInstant(photo.time, settings);
    const local = localParts(instant, offset);
    const hours = byDate.get(local.date) ?? Array.from({ length: 24 }, () => 0);
    hours[local.hour]! += 1;
    byDate.set(local.date, hours);
    byHour[local.hour]! += 1;
    if (settings.location) {
      const sun = getSunTimes(local.calendar, settings.location.latitude, settings.location.longitude);
      if (sun.kind === 'rise-set') {
        const rise = Math.floor((instant.getTime() - sun.sunrise.getTime()) / 3600000);
        const set = Math.floor((instant.getTime() - sun.sunset.getTime()) / 3600000);
        fromSunrise.set(rise, (fromSunrise.get(rise) ?? 0) + 1);
        fromSunset.set(set, (fromSunset.get(set) ?? 0) + 1);
      } else withoutSunEvent += 1;
    }
    const age = moonAge(instant);
    const phase = Math.min(MOON_PHASE_BINS - 1, Math.floor((age / 29.530589) * MOON_PHASE_BINS));
    byMoonPhase[phase]! += 1;
  }
  return {
    total: photos.length,
    byDateHour: [...byDate.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, hours]) => ({ date, hours })),
    byHour,
    fromSunrise,
    fromSunset,
    withoutSunEvent,
    byMoonPhase,
  };
}
