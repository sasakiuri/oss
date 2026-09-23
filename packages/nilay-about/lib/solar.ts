/**
 * Sunrise and sunset from the NOAA Solar Calculator equations.
 *
 * Everything is derived in UTC and returned as absolute instants, so results never
 * depend on the host time zone. Formatting for a viewer is the caller's job.
 */

export interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

/**
 * A day has both events, one of them, or neither.
 *
 * Only one turns up where daylight starts or ends near solar midnight, which is how the
 * midnight-sun season opens and closes. `solarNoon` is defined on every kind.
 */
export type SunTimes =
  | { kind: 'rise-set'; sunrise: Date; sunset: Date; solarNoon: Date }
  | { kind: 'sunrise-only'; sunrise: Date; solarNoon: Date }
  | { kind: 'sunset-only'; sunset: Date; solarNoon: Date }
  | { kind: 'midnight-sun'; solarNoon: Date }
  | { kind: 'polar-night'; solarNoon: Date };

/** Altitude of the sun's centre at sunrise and sunset: refraction plus the solar radius. */
export const SUN_HORIZON_DEGREES = -0.833;

const UNIX_EPOCH_JULIAN_DAY = 2440587.5;
const MINUTES_PER_DAY = 1440;
// The Julian day formula below is Gregorian, so it is only valid from the calendar reform on.
const MIN_YEAR = 1583;
const MAX_YEAR = 9999;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
const toDegrees = (radians: number) => (radians * 180) / Math.PI;

function julianDay({ year, month, day }: CalendarDate): number {
  const shiftedYear = month <= 2 ? year - 1 : year;
  const shiftedMonth = month <= 2 ? month + 12 : month;
  const century = Math.floor(shiftedYear / 100);
  const gregorian = 2 - century + Math.floor(century / 4);
  return (
    Math.floor(365.25 * (shiftedYear + 4716)) + Math.floor(30.6001 * (shiftedMonth + 1)) + day + gregorian - 1524.5
  );
}

function solarGeometry(julianCentury: number) {
  const t = julianCentury;
  const meanLongitude = (((280.46646 + t * (36000.76983 + t * 0.0003032)) % 360) + 360) % 360;
  const meanAnomaly = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const eccentricity = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const equationOfCentre =
    Math.sin(toRadians(meanAnomaly)) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(toRadians(2 * meanAnomaly)) * (0.019993 - 0.000101 * t) +
    Math.sin(toRadians(3 * meanAnomaly)) * 0.000289;
  const moonAscendingNode = toRadians(125.04 - 1934.136 * t);
  const apparentLongitude = meanLongitude + equationOfCentre - 0.00569 - 0.00478 * Math.sin(moonAscendingNode);
  const meanObliquity = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const obliquity = toRadians(meanObliquity + 0.00256 * Math.cos(moonAscendingNode));
  const declination = Math.asin(Math.sin(obliquity) * Math.sin(toRadians(apparentLongitude)));
  const y = Math.tan(obliquity / 2) ** 2;
  const equationOfTime =
    4 *
    toDegrees(
      y * Math.sin(2 * toRadians(meanLongitude)) -
        2 * eccentricity * Math.sin(toRadians(meanAnomaly)) +
        4 * eccentricity * y * Math.sin(toRadians(meanAnomaly)) * Math.cos(2 * toRadians(meanLongitude)) -
        0.5 * y * y * Math.sin(4 * toRadians(meanLongitude)) -
        1.25 * eccentricity ** 2 * Math.sin(2 * toRadians(meanAnomaly)),
    );
  return { declination, equationOfTime };
}

function assertRange(value: number, min: number, max: number, name: string): void {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new RangeError(`${name} must be a finite number between ${min} and ${max}`);
  }
}

/** Rejects a day the month does not have, such as 2026-02-30. Assumes an in-range year. */
function isRealCalendarDate({ year, month, day }: CalendarDate): boolean {
  const utc = new Date(Date.UTC(year, month - 1, day));
  return utc.getUTCFullYear() === year && utc.getUTCMonth() === month - 1 && utc.getUTCDate() === day;
}

/**
 * Sunrise, sunset and solar noon for the solar day that belongs to `date` at `longitude`.
 *
 * `date` is a calendar date, not an instant: the caller decides which time zone it came from.
 */
export function getSunTimes(date: CalendarDate, latitude: number, longitude: number): SunTimes {
  assertRange(date.year, MIN_YEAR, MAX_YEAR, 'year');
  assertRange(date.month, 1, 12, 'month');
  assertRange(date.day, 1, 31, 'day');
  if (!Number.isInteger(date.year) || !Number.isInteger(date.month) || !Number.isInteger(date.day)) {
    throw new RangeError('year, month and day must be integers');
  }
  if (!isRealCalendarDate(date)) throw new RangeError('the calendar has no such date');
  assertRange(latitude, -90, 90, 'latitude');
  assertRange(longitude, -180, 180, 'longitude');

  const startOfDay = julianDay(date);
  const instant = (minutes: number) =>
    new Date(Math.round((startOfDay - UNIX_EPOCH_JULIAN_DAY) * 86400000 + minutes * 60000));

  const centuryAt = (minutes: number) => (startOfDay + minutes / MINUTES_PER_DAY - 2451545) / 36525;

  /** Altitude of the sun's centre, in degrees, `minutes` after 0h UT of the Julian day. */
  const altitudeAt = (minutes: number) => {
    const { declination, equationOfTime } = solarGeometry(centuryAt(minutes));
    // True solar time as an hour angle; the cosine makes the wrap across the day harmless.
    const hourAngle = toRadians((minutes + equationOfTime + 4 * longitude) / 4 - 180);
    return toDegrees(
      Math.asin(
        Math.sin(toRadians(latitude)) * Math.sin(declination) +
          Math.cos(toRadians(latitude)) * Math.cos(declination) * Math.cos(hourAngle),
      ),
    );
  };

  // Solar noon always exists; NOAA's second pass settles the equation of time at the moment itself.
  let solarNoonMinutes = 0;
  for (let pass = 0; pass < 2; pass += 1) {
    solarNoonMinutes = 720 - 4 * longitude - solarGeometry(centuryAt(solarNoonMinutes)).equationOfTime;
  }

  /**
   * The moment the sun's centre crosses the horizon altitude within one half of the solar day.
   *
   * Bisecting the altitude itself, rather than solving for an hour angle from a declination
   * taken at some other time, is what keeps a real event on the days where the sun only just
   * clears the horizon: the same test finds it or rules it out as on any other day.
   */
  const crossing = (from: number, to: number): number | null => {
    let low = from;
    let high = to;
    let lowOffset = altitudeAt(low) - SUN_HORIZON_DEGREES;
    if (lowOffset * (altitudeAt(high) - SUN_HORIZON_DEGREES) > 0) return null;
    for (let step = 0; step < 40; step += 1) {
      const middle = (low + high) / 2;
      const middleOffset = altitudeAt(middle) - SUN_HORIZON_DEGREES;
      if (lowOffset * middleOffset <= 0) {
        high = middle;
      } else {
        low = middle;
        lowOffset = middleOffset;
      }
    }
    return (low + high) / 2;
  };

  const solarNoon = instant(solarNoonMinutes);
  const sunrise = crossing(solarNoonMinutes - MINUTES_PER_DAY / 2, solarNoonMinutes);
  const sunset = crossing(solarNoonMinutes, solarNoonMinutes + MINUTES_PER_DAY / 2);
  if (sunrise !== null && sunset !== null) {
    return { kind: 'rise-set', sunrise: instant(sunrise), sunset: instant(sunset), solarNoon };
  }
  if (sunrise !== null) return { kind: 'sunrise-only', sunrise: instant(sunrise), solarNoon };
  if (sunset !== null) return { kind: 'sunset-only', sunset: instant(sunset), solarNoon };
  // Solar noon is the day's highest altitude, so it alone says which way the sun is stuck.
  return altitudeAt(solarNoonMinutes) < SUN_HORIZON_DEGREES
    ? { kind: 'polar-night', solarNoon }
    : { kind: 'midnight-sun', solarNoon };
}

/**
 * Minute rounding for a legal boundary.
 *
 * Clocks show whole minutes, so an instant with seconds has to move one way or the other.
 * Rounding sunrise up and sunset down keeps every displayed minute inside the interval the
 * law allows, at the cost of differing by a minute from a published sunrise or sunset.
 */
const MILLISECONDS_PER_MINUTE = 60000;

export function ceilToMinute(instant: Date): Date {
  return new Date(Math.ceil(instant.getTime() / MILLISECONDS_PER_MINUTE) * MILLISECONDS_PER_MINUTE);
}

export function floorToMinute(instant: Date): Date {
  return new Date(Math.floor(instant.getTime() / MILLISECONDS_PER_MINUTE) * MILLISECONDS_PER_MINUTE);
}

/**
 * Where an instant sits relative to a day's daylight, given the bounds that day actually has.
 *
 * `start` or `end` is null on a day that has only the other event, and both are null on a day
 * that has neither. Deciding this apart from the wording keeps the four reachable answers
 * testable without a browser; the caller supplies the sentence and the number formatting.
 */
export type DaylightStatus =
  | { phase: 'before-sunrise'; untilMs: number }
  | { phase: 'until-sunset'; untilMs: number }
  | { phase: 'after-sunset' }
  | { phase: 'no-sunset' }
  | { phase: 'no-bounds' };

export function getDaylightStatus(start: Date | null, end: Date | null, now: Date): DaylightStatus {
  if (start === null && end === null) return { phase: 'no-bounds' };
  // Asked first so that a day whose bounds have collapsed onto one minute never reads as daylight.
  if (start !== null && now < start) return { phase: 'before-sunrise', untilMs: start.getTime() - now.getTime() };
  if (end !== null && now > end) return { phase: 'after-sunset' };
  if (end !== null) return { phase: 'until-sunset', untilMs: end.getTime() - now.getTime() };
  return { phase: 'no-sunset' };
}

/** The calendar date an instant falls on in the host time zone. */
export function getLocalCalendarDate(instant: Date): CalendarDate {
  return { year: instant.getFullYear(), month: instant.getMonth() + 1, day: instant.getDate() };
}

export function addCalendarDays(date: CalendarDate, days: number): CalendarDate {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

export function formatCalendarDate({ year, month, day }: CalendarDate): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function parseCalendarDate(value: string): CalendarDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < MIN_YEAR) return null;
  return isRealCalendarDate({ year, month, day }) ? { year, month, day } : null;
}

export function isSameCalendarDate(a: CalendarDate, b: CalendarDate): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}
