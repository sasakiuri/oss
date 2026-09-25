/**
 * Sunrise and sunset from the NOAA Solar Calculator equations, to the definition of the National
 * Astronomical Observatory of Japan: the moment the sun's upper limb is on the apparent horizon.
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

/** Refraction at the horizon NAOJ uses for sun and moon alike, 35′8″. */
export const HORIZON_REFRACTION_DEGREES = 35 / 60 + 8 / 3600;
/** The sun's semidiameter at 1 au, 15′59.63″ (Astronomical Almanac). */
const SUN_SEMIDIAMETER_AT_1_AU_DEGREES = 959.63 / 3600;

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
  const trueAnomaly = toRadians(meanAnomaly + equationOfCentre);
  const radiusVector = (1.000001018 * (1 - eccentricity ** 2)) / (1 + eccentricity * Math.cos(trueAnomaly));
  return { declination, equationOfTime, apparentLongitude, radiusVector };
}

/**
 * Altitude of the sun's centre at sunrise and sunset, as NAOJ defines them: the upper limb on the
 * apparent horizon, 35′8″ of refraction below it, so the centre is a further semidiameter down.
 * The semidiameter follows the distance through the year (15′44″ to 16′16″).
 */
function horizonAt(julianCentury: number): number {
  const { radiusVector } = solarGeometry(julianCentury);
  return -(HORIZON_REFRACTION_DEGREES + SUN_SEMIDIAMETER_AT_1_AU_DEGREES / radiusVector);
}

export function sunHorizonDegrees(instant: Date): number {
  return horizonAt((instant.getTime() / 86400000 + UNIX_EPOCH_JULIAN_DAY - 2451545) / 36525);
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

  /** How far the sun's centre is above its rising and setting altitude, in degrees. */
  const aboveHorizon = (minutes: number) => altitudeAt(minutes) - horizonAt(centuryAt(minutes));

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
    let lowOffset = aboveHorizon(low);
    if (lowOffset * aboveHorizon(high) > 0) return null;
    for (let step = 0; step < 40; step += 1) {
      const middle = (low + high) / 2;
      const middleOffset = aboveHorizon(middle);
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
  return aboveHorizon(solarNoonMinutes) < 0 ? { kind: 'polar-night', solarNoon } : { kind: 'midnight-sun', solarNoon };
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

/* ------------------------------------------------------------------------------------------------
 * The Moon
 *
 * Position from the low-precision formulae of the Astronomical Almanac (section D), good to about
 * 0.3° in longitude, 0.2° in latitude and 0.003° in parallax between 1900 and 2100: enough for rise
 * and set to within a couple of minutes, which is the precision the times are shown to.
 *
 * Rise and set follow the National Astronomical Observatory of Japan: the moment the Moon's centre
 * is on the apparent horizon, with 35′8″ of refraction at the horizon. The age (月齢) is the days
 * since the last new moon, as NAOJ tabulates it.
 * --------------------------------------------------------------------------------------------- */

const MOON_MIN_YEAR = 1900;
const MOON_MAX_YEAR = 2100;
const J2000 = 2451545;
const MS_PER_DAY = 86400000;

const julianDayOf = (instant: Date) => instant.getTime() / MS_PER_DAY + UNIX_EPOCH_JULIAN_DAY;
const sinDeg = (degrees: number) => Math.sin(toRadians(degrees));
const cosDeg = (degrees: number) => Math.cos(toRadians(degrees));
const normaliseDegrees = (degrees: number) => ((degrees % 360) + 360) % 360;

/** Geocentric ecliptic longitude and latitude and the horizontal parallax, in degrees. */
export function moonEcliptic(instant: Date): { longitude: number; latitude: number; parallax: number } {
  const t = (julianDayOf(instant) - J2000) / 36525;
  const longitude =
    218.32 +
    481267.881 * t +
    6.29 * sinDeg(135.0 + 477198.87 * t) -
    1.27 * sinDeg(259.3 - 413335.36 * t) +
    0.66 * sinDeg(235.7 + 890534.22 * t) +
    0.21 * sinDeg(269.9 + 954397.74 * t) -
    0.19 * sinDeg(357.5 + 35999.05 * t) -
    0.11 * sinDeg(186.5 + 966404.03 * t);
  const latitude =
    5.13 * sinDeg(93.3 + 483202.02 * t) +
    0.28 * sinDeg(228.2 + 960400.89 * t) -
    0.28 * sinDeg(318.3 + 6003.15 * t) -
    0.17 * sinDeg(217.6 - 407332.21 * t);
  const parallax =
    0.9508 +
    0.0518 * cosDeg(135.0 + 477198.87 * t) +
    0.0095 * cosDeg(259.3 - 413335.36 * t) +
    0.0078 * cosDeg(235.7 + 890534.22 * t) +
    0.0028 * cosDeg(269.9 + 954397.74 * t);
  return { longitude: normaliseDegrees(longitude), latitude, parallax };
}

/** The Moon's topocentric altitude of its centre, in degrees, without refraction. */
export function moonAltitude(instant: Date, latitude: number, longitude: number): number {
  const jd = julianDayOf(instant);
  const t = (jd - J2000) / 36525;
  const moon = moonEcliptic(instant);
  const obliquity = 23.439291 - 0.0130042 * t;
  // Ecliptic to equatorial.
  const lambda = toRadians(moon.longitude);
  const beta = toRadians(moon.latitude);
  const epsilon = toRadians(obliquity);
  const rightAscension = Math.atan2(
    Math.sin(lambda) * Math.cos(epsilon) - Math.tan(beta) * Math.sin(epsilon),
    Math.cos(lambda),
  );
  const declination = Math.asin(
    Math.sin(beta) * Math.cos(epsilon) + Math.cos(beta) * Math.sin(epsilon) * Math.sin(lambda),
  );
  // Greenwich mean sidereal time (IAU 1982, to the precision needed here).
  const siderealDegrees = 280.46061837 + 360.98564736629 * (jd - J2000);
  const hourAngle = toRadians(siderealDegrees + longitude) - rightAscension;
  const phi = toRadians(latitude);
  const geocentric = Math.asin(
    Math.sin(phi) * Math.sin(declination) + Math.cos(phi) * Math.cos(declination) * Math.cos(hourAngle),
  );
  // Parallax in altitude: the Moon seen from the surface sits lower than from the centre of the Earth.
  return toDegrees(geocentric - Math.asin(Math.sin(toRadians(moon.parallax)) * Math.cos(geocentric)));
}

export interface MoonTimes {
  /** Null on a day the Moon does not rise (or set) within it: about once a month each. */
  moonrise: Date | null;
  moonset: Date | null;
}

function assertMoonRange(instant: Date): void {
  const year = instant.getUTCFullYear();
  if (!Number.isFinite(instant.getTime()) || year < MOON_MIN_YEAR || year > MOON_MAX_YEAR) {
    throw new RangeError(`the moon is calculated for ${MOON_MIN_YEAR} to ${MOON_MAX_YEAR} only`);
  }
}

/**
 * Moonrise and moonset in the 24 hours from `dayStart`, the local midnight the caller chose. The
 * horizon crossing is found in ten-minute steps, then bisected to well under a second.
 */
export function getMoonTimes(dayStart: Date, latitude: number, longitude: number): MoonTimes {
  assertMoonRange(dayStart);
  assertRange(latitude, -90, 90, 'latitude');
  assertRange(longitude, -180, 180, 'longitude');
  const offset = (ms: number) => moonAltitude(new Date(ms), latitude, longitude) + HORIZON_REFRACTION_DEGREES;
  const start = dayStart.getTime();
  const step = 10 * 60000;
  let moonrise: Date | null = null;
  let moonset: Date | null = null;
  let previous = offset(start);
  for (let at = start + step; at <= start + MS_PER_DAY; at += step) {
    const current = offset(at);
    if (previous * current <= 0 && previous !== current) {
      let low = at - step;
      let high = at;
      let lowValue = previous;
      for (let index = 0; index < 30; index += 1) {
        const middle = (low + high) / 2;
        const value = offset(middle);
        if (lowValue * value <= 0) high = middle;
        else {
          low = middle;
          lowValue = value;
        }
      }
      const event = new Date(Math.round((low + high) / 2));
      if (previous < current && moonrise === null) moonrise = event;
      if (previous > current && moonset === null) moonset = event;
    }
    previous = current;
  }
  return { moonrise, moonset };
}

/** Degrees the Moon is ahead of the Sun in ecliptic longitude, 0 at new moon and 180 at full. */
function elongation(instant: Date): number {
  const t = (julianDayOf(instant) - J2000) / 36525;
  return normaliseDegrees(moonEcliptic(instant).longitude - solarGeometry(t).apparentLongitude);
}

/** The last new moon at or before `instant`. */
export function previousNewMoon(instant: Date): Date {
  assertMoonRange(instant);
  // Walk back a day at a time until the elongation wraps from small to nearly 360°.
  let later = instant.getTime();
  let earlier = later - MS_PER_DAY;
  let laterValue = elongation(new Date(later));
  for (let days = 0; days < 32; days += 1) {
    const earlierValue = elongation(new Date(earlier));
    if (earlierValue > laterValue) break;
    later = earlier;
    laterValue = earlierValue;
    earlier -= MS_PER_DAY;
  }
  for (let index = 0; index < 40; index += 1) {
    const middle = (earlier + later) / 2;
    if (elongation(new Date(middle)) > 180) earlier = middle;
    else later = middle;
  }
  return new Date(Math.round((earlier + later) / 2));
}

/** Days since the last new moon, as NAOJ's 月齢. */
export function moonAge(instant: Date): number {
  return (instant.getTime() - previousNewMoon(instant).getTime()) / MS_PER_DAY;
}

/** The lit fraction of the disc, 0 at new moon and 1 at full, from the Sun–Moon elongation. */
export function moonIlluminatedFraction(instant: Date): number {
  assertMoonRange(instant);
  const t = (julianDayOf(instant) - J2000) / 36525;
  const moon = moonEcliptic(instant);
  const cosElongation = cosDeg(moon.latitude) * cosDeg(moon.longitude - solarGeometry(t).apparentLongitude);
  return (1 - cosElongation) / 2;
}

/** Whether the Moon is growing or shrinking, for naming its phase. */
export function moonIsWaxing(instant: Date): boolean {
  return elongation(instant) < 180;
}
