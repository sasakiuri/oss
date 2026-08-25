import { describe, it, expect } from 'vitest';
import { formatScore, formatOrdinal } from '@/renderer/presentation/features/shared/scoring/scoreFormatting';

describe('formatScore', () => {
  it('should return "-" for undefined', () => {
    expect(formatScore(undefined)).toBe('-');
  });

  it('should format integer scores with 1 decimal place', () => {
    expect(formatScore(10)).toBe('10.0');
    expect(formatScore(0)).toBe('0.0');
    expect(formatScore(100)).toBe('100.0');
  });

  it('should format decimal scores with 1 decimal place', () => {
    expect(formatScore(10.5)).toBe('10.5');
    expect(formatScore(9.123)).toBe('9.1');
    expect(formatScore(10.96)).toBe('11.0');
  });

  it('should handle negative scores', () => {
    expect(formatScore(-1)).toBe('-1.0');
  });
});

describe('formatOrdinal', () => {
  it('should format 1st, 2nd, 3rd', () => {
    expect(formatOrdinal(1)).toBe('1st');
    expect(formatOrdinal(2)).toBe('2nd');
    expect(formatOrdinal(3)).toBe('3rd');
  });

  it('should format 4th-10th with "th"', () => {
    expect(formatOrdinal(4)).toBe('4th');
    expect(formatOrdinal(5)).toBe('5th');
    expect(formatOrdinal(10)).toBe('10th');
  });

  it('should handle 11th, 12th, 13th as special cases', () => {
    expect(formatOrdinal(11)).toBe('11th');
    expect(formatOrdinal(12)).toBe('12th');
    expect(formatOrdinal(13)).toBe('13th');
  });

  it('should handle 21st, 22nd, 23rd', () => {
    expect(formatOrdinal(21)).toBe('21st');
    expect(formatOrdinal(22)).toBe('22nd');
    expect(formatOrdinal(23)).toBe('23rd');
  });

  it('should handle 111th, 112th, 113th as special cases', () => {
    expect(formatOrdinal(111)).toBe('111th');
    expect(formatOrdinal(112)).toBe('112th');
    expect(formatOrdinal(113)).toBe('113th');
  });

  it('should handle larger numbers', () => {
    expect(formatOrdinal(101)).toBe('101st');
    expect(formatOrdinal(102)).toBe('102nd');
    expect(formatOrdinal(103)).toBe('103rd');
    expect(formatOrdinal(104)).toBe('104th');
  });
});
