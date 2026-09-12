/**
 * Returns the number of days in the given month (1-indexed).
 * Handles leap years: divisible by 4, but not 100, unless also 400.
 */
export function getDaysInMonth(year: number, month: number): number {
  const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  if (month < 1 || month > 12) {
    return 0;
  }

  if (month === 2) {
    const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return isLeapYear ? 29 : 28;
  }

  return daysInMonth[month - 1]!;
}

/**
 * Returns the day of the week (0=Sunday) for the first day of the given month.
 */
export function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month - 1, 1).getDay();
}

/**
 * Validates a date string in "YYYY/MM/DD" format.
 * Must be exactly 10 characters, valid month (1-12), valid day for the month.
 * Supports leap year validation.
 */
export function isValidDisplayDate(input: string): boolean {
  if (input.length !== 10) {
    return false;
  }

  const pattern = /^\d{4}\/\d{2}\/\d{2}$/;
  if (!pattern.test(input)) {
    return false;
  }

  const parts = input.split('/');
  const year = parseInt(parts[0]!, 10);
  const month = parseInt(parts[1]!, 10);
  const day = parseInt(parts[2]!, 10);

  if (month < 1 || month > 12) {
    return false;
  }

  const maxDay = getDaysInMonth(year, month);
  if (day < 1 || day > maxDay) {
    return false;
  }

  return true;
}

/**
 * Converts "YYYY-MM-DD" to "YYYY/MM/DD".
 * If empty or invalid format, returns empty string.
 */
export function isoToDisplay(iso: string): string {
  if (!iso) {
    return '';
  }

  const pattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!pattern.test(iso)) {
    return '';
  }

  return iso.replace(/-/g, '/');
}

/**
 * Converts "YYYY/MM/DD" to "YYYY-MM-DD".
 * If empty or invalid format, returns empty string.
 */
export function displayToIso(display: string): string {
  if (!display) {
    return '';
  }

  if (!isValidDisplayDate(display)) {
    return '';
  }

  return display.replace(/\//g, '-');
}

/**
 * Auto-inserts "/" after the 4th and 6th digits.
 * Only keeps numeric and "/" characters. Max length 10.
 */
export function autoFormatDate(input: string): string {
  // Keep only digits
  const digits = input.replace(/[^0-9]/g, '');

  let result = '';

  for (let i = 0; i < digits.length && result.length < 10; i++) {
    if (i === 4 || i === 6) {
      result += '/';
    }
    result += digits[i];
  }

  return result;
}
