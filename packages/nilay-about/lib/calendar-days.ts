/**
 * Arithmetic on calendar days written as ISO dates (YYYY-MM-DD).
 *
 * The statutes count in Japanese calendar days, so these never go through a local time zone: every
 * date is built in UTC and read back the same way.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseIsoDate(value: string): [number, number, number] | null {
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return [year, month, day];
}

export function isIsoDate(value: string): boolean {
  return parseIsoDate(value) !== null;
}

function parts(value: string): [number, number, number] {
  const parsed = parseIsoDate(value);
  if (!parsed) throw new Error(`Not an ISO date: ${value}`);
  return parsed;
}

const pad = (value: number) => String(value).padStart(2, '0');

export function isoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${pad(month)}-${pad(day)}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addDays(value: string, days: number): string {
  const [year, month, day] = parts(value);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  const [y1, m1, d1] = parts(from);
  const [y2, m2, d2] = parts(to);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/**
 * The same day `months` months later (or earlier, when negative). A day the target month does not
 * have becomes its last day, as with 31 March two months back, which is 31 January, and one month
 * back, which is 28 or 29 February.
 */
export function shiftMonths(value: string, months: number): string {
  const [year, month, day] = parts(value);
  const index = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(index / 12);
  const targetMonth = (index % 12) + 1;
  return isoDate(targetYear, targetMonth, Math.min(day, daysInMonth(targetYear, targetMonth)));
}

/**
 * The last day of a period of whole years that starts on `start` and counts that day
 * (民法 第百四十三条): the day before the day of the same number, or the last day of the month when
 * that month has no such day.
 */
export function lastDayOfYears(start: string, years: number): string {
  const [year, month, day] = parts(start);
  const targetYear = year + years;
  if (day > daysInMonth(targetYear, month)) return isoDate(targetYear, month, daysInMonth(targetYear, month));
  return addDays(isoDate(targetYear, month, day), -1);
}

/**
 * Completed years of age on `on`. 年齢計算ニ関スル法律 counts age from the day of birth and applies
 * 民法 第百四十三条, so each year of age is reached at the end of the day before the birthday, or of
 * the last day of February for a birthday on 29 February in other years, and counts on that day
 * (as for the voting age, where a person whose 18th birthday is the day after the election may vote).
 */
export function ageOn(birthDate: string, on: string): number {
  const [by] = parts(birthDate);
  const [y] = parts(on);
  // The age reached in the year of `on` is y - by, and it is reached on the last day of that many years.
  const years = y - by;
  if (years <= 0) return 0;
  return lastDayOfYears(birthDate, years) <= on ? years : years - 1;
}
