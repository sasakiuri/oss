import { describe, expect, it } from 'vitest';

import {
  addCalendarDays,
  ceilToMinute,
  floorToMinute,
  formatCalendarDate,
  getDaylightStatus,
  getLocalCalendarDate,
  getSunTimes,
  isSameCalendarDate,
  parseCalendarDate,
  sunHorizonDegrees,
  type CalendarDate,
} from '@/lib/solar';

/**
 * Expected times come from 国立天文台暦計算室「各地のこよみ（日の出入り）」, read on 2026-09-22:
 * https://eco.mtk.nao.ac.jp/koyomi/dni/2026/s1303.html (東京 3 月), s1306/s1309/s1312 (東京),
 * s4806/s4809/s4812 (那覇), s0006/s0009/s0012 (札幌), s4112 (福岡), s2106 (長野).
 * Coordinates are the ones printed on those pages, and every time is JST (UT+9).
 */
const JST_OFFSET_MINUTES = 9 * 60;
const TOLERANCE_MS = 2 * 60 * 1000;

interface Reference {
  place: string;
  latitude: number;
  longitude: number;
  date: CalendarDate;
  sunrise: string;
  noon: string;
  sunset: string;
}

const references: Reference[] = [
  { place: '東京', latitude: 35.6581, longitude: 139.7414, date: { year: 2026, month: 3, day: 20 }, sunrise: '5:45', noon: '11:49', sunset: '17:52' }, // prettier-ignore
  { place: '東京', latitude: 35.6581, longitude: 139.7414, date: { year: 2026, month: 6, day: 21 }, sunrise: '4:25', noon: '11:43', sunset: '19:00' }, // prettier-ignore
  { place: '東京', latitude: 35.6581, longitude: 139.7414, date: { year: 2026, month: 9, day: 22 }, sunrise: '5:29', noon: '11:34', sunset: '17:39' }, // prettier-ignore
  { place: '東京', latitude: 35.6581, longitude: 139.7414, date: { year: 2026, month: 12, day: 22 }, sunrise: '6:47', noon: '11:39', sunset: '16:32' }, // prettier-ignore
  { place: '那覇', latitude: 26.2167, longitude: 127.6667, date: { year: 2026, month: 6, day: 21 }, sunrise: '5:37', noon: '12:31', sunset: '19:25' }, // prettier-ignore
  { place: '那覇', latitude: 26.2167, longitude: 127.6667, date: { year: 2026, month: 9, day: 22 }, sunrise: '6:18', noon: '12:22', sunset: '18:26' }, // prettier-ignore
  { place: '那覇', latitude: 26.2167, longitude: 127.6667, date: { year: 2026, month: 12, day: 22 }, sunrise: '7:13', noon: '12:28', sunset: '17:43' }, // prettier-ignore
  { place: '札幌', latitude: 43.0667, longitude: 141.35, date: { year: 2026, month: 6, day: 21 }, sunrise: '3:55', noon: '11:36', sunset: '19:18' }, // prettier-ignore
  { place: '札幌', latitude: 43.0667, longitude: 141.35, date: { year: 2026, month: 9, day: 22 }, sunrise: '5:21', noon: '11:27', sunset: '17:33' }, // prettier-ignore
  { place: '札幌', latitude: 43.0667, longitude: 141.35, date: { year: 2026, month: 12, day: 22 }, sunrise: '7:03', noon: '11:33', sunset: '16:03' }, // prettier-ignore
  { place: '福岡', latitude: 33.5833, longitude: 130.4, date: { year: 2026, month: 12, day: 22 }, sunrise: '7:19', noon: '12:17', sunset: '17:15' }, // prettier-ignore
  { place: '長野', latitude: 36.65, longitude: 138.1833, date: { year: 2026, month: 6, day: 21 }, sunrise: '4:29', noon: '11:49', sunset: '19:09' }, // prettier-ignore
];

/** Absolute instant of a JST wall clock time, so expectations never read the host time zone. */
function jst({ year, month, day }: CalendarDate, time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return Date.UTC(year, month - 1, day, 0, Number(hours) * 60 + Number(minutes) - JST_OFFSET_MINUTES);
}

describe('getSunTimes', () => {
  it.each(references)(
    'matches 国立天文台 for $place on $date.year-$date.month-$date.day',
    ({ latitude, longitude, date, sunrise, noon, sunset }) => {
      const times = getSunTimes(date, latitude, longitude);
      expect(times.kind).toBe('rise-set');
      if (times.kind !== 'rise-set') return;
      expect(Math.abs(times.sunrise.getTime() - jst(date, sunrise))).toBeLessThanOrEqual(TOLERANCE_MS);
      expect(Math.abs(times.sunset.getTime() - jst(date, sunset))).toBeLessThanOrEqual(TOLERANCE_MS);
      expect(Math.abs(times.solarNoon.getTime() - jst(date, noon))).toBeLessThanOrEqual(TOLERANCE_MS);
      expect(times.sunrise.getTime()).toBeLessThan(times.solarNoon.getTime());
      expect(times.solarNoon.getTime()).toBeLessThan(times.sunset.getTime());
    },
  );

  /**
   * NAOJ defines sunrise and sunset as the sun's upper limb on the apparent horizon, with 35′8″ of
   * refraction at the horizon, so the centre stands one semidiameter lower: 15′59.63″ at 1 au,
   * 16′16″ at perihelion and 15′44″ at aphelion.
   */
  it('puts the sun’s centre 35′8″ and one semidiameter below the horizon, as NAOJ defines it', () => {
    const refraction = 35 / 60 + 8 / 3600;
    // 2026-01-03 perihelion 0.98330 au, 2026-07-06 aphelion 1.01665 au.
    expect(sunHorizonDegrees(new Date(Date.UTC(2026, 0, 3, 17)))).toBeCloseTo(
      -(refraction + 959.63 / 0.9833 / 3600),
      4,
    );
    expect(sunHorizonDegrees(new Date(Date.UTC(2026, 6, 6, 18)))).toBeCloseTo(
      -(refraction + 959.63 / 1.01665 / 3600),
      4,
    );
  });

  it('reports the days when the sun never sets or never rises', () => {
    // Longyearbyen, Svalbard: polar day around the June solstice and polar night in December.
    expect(getSunTimes({ year: 2026, month: 6, day: 21 }, 78.22, 15.65)).toMatchObject({ kind: 'midnight-sun' });
    expect(getSunTimes({ year: 2026, month: 12, day: 22 }, 78.22, 15.65)).toMatchObject({ kind: 'polar-night' });
    expect(getSunTimes({ year: 2026, month: 12, day: 22 }, -78.22, 15.65)).toMatchObject({ kind: 'midnight-sun' });
    expect(getSunTimes({ year: 2026, month: 12, day: 22 }, 70, 0)).toMatchObject({ kind: 'polar-night' });
    const polar = getSunTimes({ year: 2026, month: 6, day: 21 }, 90, 0);
    expect(polar.kind).toBe('midnight-sun');
    expect(polar.solarNoon.getTime()).toBeGreaterThan(0);
    expect(getSunTimes({ year: 2026, month: 12, day: 22 }, 90, 0).kind).toBe('polar-night');
  });

  /**
   * The days that open and close a midnight-sun season have only one of the two events, because
   * daylight there begins or ends near solar midnight — the edge of the solar day, not its middle.
   *
   * Read the tolerances here the opposite way round from the rest of the file. On these two days
   * the sensitive assertion is the `kind`, not the time. What decides a kind is the sun's altitude
   * at the two midnights around the solar day, and at 65.8 N those margins are almost nothing.
   * A day is only as robust as its smaller margin, since either midnight can flip it. With NAOJ's
   * horizon (35′8″ of refraction and the semidiameter), from the independent ephemeris below:
   *
   *   06-15 rise-set      before -0.05569°  after -0.01545°   decisive 0.0155°
   *   06-16 sunrise-only  before -0.01545°  after +0.01792°   decisive 0.0155°
   *   06-21 midnight-sun  before +0.08258°  after +0.08152°   decisive 0.0815°
   *   06-25 midnight-sun  before +0.03704°  after +0.00848°   decisive 0.0085°
   *   06-26 sunset-only   before +0.00848°  after -0.02693°   decisive 0.0085°
   *   06-27 rise-set      before -0.02693°  after -0.06917°   decisive 0.0269°
   *
   * The horizon decides these kinds: the former -0.833° made 06-25 the sunset-only day and 06-26
   * a rise-set day. So a failure on those kinds is not automatically a regression: check the
   * margin first. Neighbouring is not the same as robust — 06-25 shares its decisive midnight
   * with 06-26 and is every bit as fragile. Only 06-21 has real room.
   *
   * Do not thin these cases out on the grounds that the surrounding days would catch the same
   * thing. They would not. The regression this block exists for — a solver that found one event
   * of a pair and reported the day as having neither — changed the two one-sided days and no other day
   * in this range; every other day returned the same kind before and after the fix. The two kind
   * assertions below are the only thing in this file that detects it.
   *
   * The 5-minute window is not the loose part. Near these crossings the sun grazes the horizon, so
   * 5 minutes moves its altitude by only 0.003° to 0.029°, where 2 minutes on an ordinary day
   * moves it by 0.30° to 0.40° — this bound is over an order of magnitude tighter in the quantity
   * the calculation actually solves for.
   *
   * Expected times come from an ephemeris and a root finder independent of this module: the
   * Astronomical Almanac low-precision sun (different series and structure from the NOAA equations
   * used here), its distance for the semidiameter, and a 10-second scan with bisection on the
   * altitude. It gives 00:09:15 UTC on 2026-06-16 and 23:51:37 UTC on 2026-06-26. The gap to this
   * module is the grazing sensitivity, not an error in either.
   */
  describe('the days that open and close a midnight-sun season', () => {
    const TRANSITION_TOLERANCE_MS = 5 * 60 * 1000;
    const utc = (day: number, hours: number, minutes: number, seconds: number) =>
      Date.UTC(2026, 5, day, hours, minutes, seconds);

    it('keeps the sunrise on the day the daylight begins', () => {
      const times = getSunTimes({ year: 2026, month: 6, day: 16 }, 65.8, 0);
      expect(times.kind).toBe('sunrise-only');
      if (times.kind !== 'sunrise-only') return;
      expect(Math.abs(times.sunrise.getTime() - utc(16, 0, 9, 15))).toBeLessThanOrEqual(TRANSITION_TOLERANCE_MS);
    });

    it('keeps the sunset on the day the daylight ends', () => {
      const times = getSunTimes({ year: 2026, month: 6, day: 26 }, 65.8, 0);
      expect(times.kind).toBe('sunset-only');
      if (times.kind !== 'sunset-only') return;
      expect(Math.abs(times.sunset.getTime() - utc(26, 23, 51, 37))).toBeLessThanOrEqual(TRANSITION_TOLERANCE_MS);
    });

    it('still reports the days on either side of the season', () => {
      expect(getSunTimes({ year: 2026, month: 6, day: 15 }, 65.8, 0).kind).toBe('rise-set');
      expect(getSunTimes({ year: 2026, month: 6, day: 21 }, 65.8, 0).kind).toBe('midnight-sun');
      expect(getSunTimes({ year: 2026, month: 6, day: 25 }, 65.8, 0).kind).toBe('midnight-sun');
      expect(getSunTimes({ year: 2026, month: 6, day: 27 }, 65.8, 0).kind).toBe('rise-set');
    });

    /**
     * Polar night has no one-sided day at all: its sunrise and sunset converge on solar noon, the
     * middle of the solar day, so the last day with any sun keeps both of them. 68 N, 0 E loses
     * both on the same date.
     */
    it('drops both events together where polar night begins', () => {
      expect(getSunTimes({ year: 2026, month: 12, day: 9 }, 68, 0).kind).toBe('rise-set');
      expect(getSunTimes({ year: 2026, month: 12, day: 10 }, 68, 0).kind).toBe('polar-night');
    });
  });

  it('does not depend on the host time zone', () => {
    const original = process.env.TZ;
    const sunriseIn = (timeZone: string) => {
      process.env.TZ = timeZone;
      const times = getSunTimes({ year: 2026, month: 6, day: 21 }, 35.6581, 139.7414);
      return times.kind === 'rise-set' ? times.sunrise.getTime() : NaN;
    };
    try {
      expect(Math.abs(sunriseIn('UTC') - jst({ year: 2026, month: 6, day: 21 }, '4:25'))).toBeLessThanOrEqual(
        TOLERANCE_MS,
      );
      expect(sunriseIn('America/Los_Angeles')).toBe(sunriseIn('UTC'));
      expect(sunriseIn('Pacific/Kiritimati')).toBe(sunriseIn('Asia/Tokyo'));
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });

  it('rejects coordinates and dates it cannot compute', () => {
    const date = { year: 2026, month: 9, day: 22 };
    expect(() => getSunTimes(date, 91, 0)).toThrow(RangeError);
    expect(() => getSunTimes(date, 0, 181)).toThrow(RangeError);
    expect(() => getSunTimes(date, NaN, 0)).toThrow(RangeError);
    expect(() => getSunTimes({ ...date, month: 13 }, 0, 0)).toThrow(RangeError);
    expect(() => getSunTimes({ ...date, day: 22.5 }, 0, 0)).toThrow(RangeError);
    expect(() => getSunTimes({ ...date, year: 1500 }, 0, 0)).toThrow(RangeError);
  });

  it('rejects a day the month does not have instead of rolling into the next one', () => {
    expect(() => getSunTimes({ year: 2026, month: 2, day: 30 }, 35.6581, 139.7414)).toThrow(RangeError);
    expect(() => getSunTimes({ year: 2026, month: 2, day: 29 }, 35.6581, 139.7414)).toThrow(RangeError);
    expect(() => getSunTimes({ year: 2027, month: 2, day: 29 }, 35.6581, 139.7414)).toThrow(RangeError);
    expect(() => getSunTimes({ year: 2026, month: 4, day: 31 }, 35.6581, 139.7414)).toThrow(RangeError);
    expect(() => getSunTimes({ year: 2026, month: 9, day: 0 }, 35.6581, 139.7414)).toThrow(RangeError);
    // 2028 is a leap year, so the same day is fine there.
    expect(getSunTimes({ year: 2028, month: 2, day: 29 }, 35.6581, 139.7414).kind).toBe('rise-set');
  });
});

describe('minute rounding for the legal boundary', () => {
  const at = (hours: number, minutes: number, seconds: number, milliseconds = 0) =>
    new Date(Date.UTC(2026, 5, 21, hours, minutes, seconds, milliseconds));

  it('moves a sunrise up to the next minute', () => {
    expect(ceilToMinute(at(5, 28, 36)).toISOString()).toBe(at(5, 29, 0).toISOString());
    expect(ceilToMinute(at(4, 25, 30)).toISOString()).toBe(at(4, 26, 0).toISOString());
    expect(ceilToMinute(at(4, 25, 0, 1)).toISOString()).toBe(at(4, 26, 0).toISOString());
  });

  it('moves a sunset down to the minute', () => {
    expect(floorToMinute(at(19, 24, 36)).toISOString()).toBe(at(19, 24, 0).toISOString());
    expect(floorToMinute(at(19, 0, 2)).toISOString()).toBe(at(19, 0, 0).toISOString());
    expect(floorToMinute(at(19, 0, 0, 999)).toISOString()).toBe(at(19, 0, 0).toISOString());
  });

  it('leaves an instant that is already on the minute alone', () => {
    expect(ceilToMinute(at(6, 0, 0)).toISOString()).toBe(at(6, 0, 0).toISOString());
    expect(floorToMinute(at(6, 0, 0)).toISOString()).toBe(at(6, 0, 0).toISOString());
  });

  it('never presents a minute outside the real interval', () => {
    for (const { latitude, longitude, date } of references) {
      const times = getSunTimes(date, latitude, longitude);
      if (times.kind !== 'rise-set') continue;
      const start = ceilToMinute(times.sunrise);
      const end = floorToMinute(times.sunset);
      expect(start.getTime()).toBeGreaterThanOrEqual(times.sunrise.getTime());
      expect(end.getTime()).toBeLessThanOrEqual(times.sunset.getTime());
      expect(start.getTime() - times.sunrise.getTime()).toBeLessThan(60000);
      expect(times.sunset.getTime() - end.getTime()).toBeLessThan(60000);
      // The shown length can only be shorter than the real one, never longer.
      expect(end.getTime() - start.getTime()).toBeLessThanOrEqual(times.sunset.getTime() - times.sunrise.getTime());
    }
  });
});

describe('getDaylightStatus', () => {
  const at = (hours: number, minutes: number) => new Date(Date.UTC(2026, 5, 21, hours, minutes));
  const sunrise = at(5, 0);
  const sunset = at(19, 0);
  const minutes = (value: number) => value * 60 * 1000;

  it('walks an ordinary day through its three states', () => {
    expect(getDaylightStatus(sunrise, sunset, at(4, 30))).toEqual({
      phase: 'before-sunrise',
      untilMs: minutes(30),
    });
    expect(getDaylightStatus(sunrise, sunset, at(12, 0))).toEqual({ phase: 'until-sunset', untilMs: minutes(420) });
    expect(getDaylightStatus(sunrise, sunset, at(19, 30))).toEqual({ phase: 'after-sunset' });
  });

  it('counts the bounds themselves as daylight', () => {
    expect(getDaylightStatus(sunrise, sunset, sunrise)).toEqual({ phase: 'until-sunset', untilMs: minutes(840) });
    expect(getDaylightStatus(sunrise, sunset, sunset)).toEqual({ phase: 'until-sunset', untilMs: 0 });
  });

  it('says the sun will not set again on a day that has no sunset', () => {
    expect(getDaylightStatus(sunrise, null, at(4, 30))).toEqual({ phase: 'before-sunrise', untilMs: minutes(30) });
    expect(getDaylightStatus(sunrise, null, at(5, 30))).toEqual({ phase: 'no-sunset' });
    expect(getDaylightStatus(sunrise, null, at(23, 59))).toEqual({ phase: 'no-sunset' });
  });

  it('treats a day with no sunrise as daylight until its sunset', () => {
    expect(getDaylightStatus(null, sunset, at(0, 1))).toEqual({ phase: 'until-sunset', untilMs: minutes(1139) });
    expect(getDaylightStatus(null, sunset, at(18, 0))).toEqual({ phase: 'until-sunset', untilMs: minutes(60) });
    expect(getDaylightStatus(null, sunset, at(19, 30))).toEqual({ phase: 'after-sunset' });
  });

  it('never reports daylight on a day whose bounds have collapsed', () => {
    // Rounding a sub-minute day to whole minutes can leave the sunset before the sunrise.
    const collapsedStart = at(11, 52);
    const collapsedEnd = at(11, 51);
    for (const hour of [0, 11, 12, 23]) {
      expect(getDaylightStatus(collapsedStart, collapsedEnd, at(hour, 52)).phase).not.toBe('until-sunset');
    }
    expect(getDaylightStatus(collapsedStart, collapsedEnd, at(11, 0)).phase).toBe('before-sunrise');
    expect(getDaylightStatus(collapsedStart, collapsedEnd, at(12, 0)).phase).toBe('after-sunset');
  });

  it('has nothing to compare against on a polar day', () => {
    expect(getDaylightStatus(null, null, at(12, 0))).toEqual({ phase: 'no-bounds' });
  });

  it('agrees with the bounds a real one-sided day produces', () => {
    const rising = getSunTimes({ year: 2026, month: 6, day: 16 }, 65.8, 0);
    expect(rising.kind).toBe('sunrise-only');
    if (rising.kind !== 'sunrise-only') return;
    const start = ceilToMinute(rising.sunrise);
    expect(getDaylightStatus(start, null, new Date(start.getTime() - 1)).phase).toBe('before-sunrise');
    expect(getDaylightStatus(start, null, new Date(start.getTime() + 1)).phase).toBe('no-sunset');

    const setting = getSunTimes({ year: 2026, month: 6, day: 26 }, 65.8, 0);
    expect(setting.kind).toBe('sunset-only');
    if (setting.kind !== 'sunset-only') return;
    const end = floorToMinute(setting.sunset);
    expect(getDaylightStatus(null, end, new Date(end.getTime() - 1)).phase).toBe('until-sunset');
    expect(getDaylightStatus(null, end, new Date(end.getTime() + 1)).phase).toBe('after-sunset');
  });
});

describe('calendar date helpers', () => {
  it('moves across month, year and leap-day boundaries', () => {
    expect(addCalendarDays({ year: 2026, month: 12, day: 31 }, 1)).toEqual({ year: 2027, month: 1, day: 1 });
    expect(addCalendarDays({ year: 2026, month: 1, day: 1 }, -1)).toEqual({ year: 2025, month: 12, day: 31 });
    expect(addCalendarDays({ year: 2028, month: 2, day: 28 }, 1)).toEqual({ year: 2028, month: 2, day: 29 });
    expect(addCalendarDays({ year: 2027, month: 2, day: 28 }, 1)).toEqual({ year: 2027, month: 3, day: 1 });
  });

  it('round-trips the form value and rejects dates the calendar does not have', () => {
    expect(formatCalendarDate({ year: 2026, month: 9, day: 2 })).toBe('2026-09-02');
    expect(parseCalendarDate('2026-09-02')).toEqual({ year: 2026, month: 9, day: 2 });
    expect(parseCalendarDate('2026-02-30')).toBeNull();
    expect(parseCalendarDate('2026-13-01')).toBeNull();
    expect(parseCalendarDate('2026-9-2')).toBeNull();
    expect(parseCalendarDate('')).toBeNull();
    expect(parseCalendarDate('0001-01-01')).toBeNull();
  });

  it('reads the calendar date of an instant in the host time zone', () => {
    // Both sides use local time, so this holds in any time zone.
    expect(getLocalCalendarDate(new Date(2026, 8, 22, 23, 59))).toEqual({ year: 2026, month: 9, day: 22 });
    expect(isSameCalendarDate({ year: 2026, month: 9, day: 22 }, { year: 2026, month: 9, day: 22 })).toBe(true);
    expect(isSameCalendarDate({ year: 2026, month: 9, day: 22 }, { year: 2026, month: 9, day: 23 })).toBe(false);
  });
});
