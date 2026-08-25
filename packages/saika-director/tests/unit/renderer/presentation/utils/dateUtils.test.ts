import { describe, it, expect } from 'vitest';
import {
  getDaysInMonth,
  getFirstDayOfMonth,
  isValidDisplayDate,
  isoToDisplay,
  displayToIso,
  autoFormatDate,
} from '@/renderer/presentation/features/shared/common/dateUtils';

describe('getDaysInMonth', () => {
  it('should return 31 for January', () => {
    expect(getDaysInMonth(2026, 1)).toBe(31);
  });

  it('should return 28 for February (non-leap year)', () => {
    expect(getDaysInMonth(2025, 2)).toBe(28);
  });

  it('should return 29 for February (leap year)', () => {
    expect(getDaysInMonth(2024, 2)).toBe(29);
  });

  it('should return 30 for April', () => {
    expect(getDaysInMonth(2026, 4)).toBe(30);
  });

  it('should return 31 for December', () => {
    expect(getDaysInMonth(2026, 12)).toBe(31);
  });

  it('should return 0 for invalid month 0', () => {
    expect(getDaysInMonth(2026, 0)).toBe(0);
  });

  it('should return 0 for invalid month 13', () => {
    expect(getDaysInMonth(2026, 13)).toBe(0);
  });

  it('should handle century year not divisible by 400', () => {
    expect(getDaysInMonth(1900, 2)).toBe(28);
  });

  it('should handle century year divisible by 400', () => {
    expect(getDaysInMonth(2000, 2)).toBe(29);
  });
});

describe('getFirstDayOfMonth', () => {
  it('should return day of week for first of month', () => {
    // 2026-01-01 is Thursday (4)
    expect(getFirstDayOfMonth(2026, 1)).toBe(4);
  });

  it('should return 0 for Sunday', () => {
    // 2026-02-01 is Sunday (0)
    expect(getFirstDayOfMonth(2026, 2)).toBe(0);
  });
});

describe('isValidDisplayDate', () => {
  it('should return true for valid date', () => {
    expect(isValidDisplayDate('2026/01/15')).toBe(true);
  });

  it('should return false for wrong length', () => {
    expect(isValidDisplayDate('2026/1/15')).toBe(false);
  });

  it('should return false for wrong format', () => {
    expect(isValidDisplayDate('2026-01-15')).toBe(false);
  });

  it('should return false for invalid month', () => {
    expect(isValidDisplayDate('2026/13/01')).toBe(false);
  });

  it('should return false for month 0', () => {
    expect(isValidDisplayDate('2026/00/01')).toBe(false);
  });

  it('should return false for invalid day', () => {
    expect(isValidDisplayDate('2026/02/30')).toBe(false);
  });

  it('should return false for day 0', () => {
    expect(isValidDisplayDate('2026/01/00')).toBe(false);
  });

  it('should validate leap year February 29', () => {
    expect(isValidDisplayDate('2024/02/29')).toBe(true);
  });

  it('should reject non-leap year February 29', () => {
    expect(isValidDisplayDate('2025/02/29')).toBe(false);
  });

  it('should return false for non-numeric characters', () => {
    expect(isValidDisplayDate('abcd/ef/gh')).toBe(false);
  });
});

describe('isoToDisplay', () => {
  it('should convert ISO to display format', () => {
    expect(isoToDisplay('2026-01-15')).toBe('2026/01/15');
  });

  it('should return empty string for empty input', () => {
    expect(isoToDisplay('')).toBe('');
  });

  it('should return empty string for invalid format', () => {
    expect(isoToDisplay('2026/01/15')).toBe('');
  });

  it('should return empty string for partial ISO', () => {
    expect(isoToDisplay('2026-01')).toBe('');
  });
});

describe('displayToIso', () => {
  it('should convert display to ISO format', () => {
    expect(displayToIso('2026/01/15')).toBe('2026-01-15');
  });

  it('should return empty string for empty input', () => {
    expect(displayToIso('')).toBe('');
  });

  it('should return empty string for invalid date', () => {
    expect(displayToIso('2026/13/01')).toBe('');
  });
});

describe('autoFormatDate', () => {
  it('should add slashes after 4th and 6th digits', () => {
    expect(autoFormatDate('20260115')).toBe('2026/01/15');
  });

  it('should handle partial input', () => {
    expect(autoFormatDate('2026')).toBe('2026');
  });

  it('should add slash after year', () => {
    expect(autoFormatDate('20260')).toBe('2026/0');
  });

  it('should add slash after month', () => {
    expect(autoFormatDate('202601')).toBe('2026/01');
    expect(autoFormatDate('2026011')).toBe('2026/01/1');
  });

  it('should strip non-numeric characters', () => {
    expect(autoFormatDate('2026/01/15')).toBe('2026/01/15');
  });

  it('should handle empty string', () => {
    expect(autoFormatDate('')).toBe('');
  });

  it('should limit to 10 characters', () => {
    expect(autoFormatDate('202601151234')).toBe('2026/01/15');
  });

  it('should strip letters', () => {
    expect(autoFormatDate('2026abc01')).toBe('2026/01');
  });
});
