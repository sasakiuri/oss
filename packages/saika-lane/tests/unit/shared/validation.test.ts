// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import {
  nonNegativeInteger,
  optionalText,
  positiveInteger,
  requiredText,
  validDate,
  validTime,
} from '@/shared/validation';

describe('validation', () => {
  it('trims required text and names a blank field', () => {
    expect(requiredText('  lane-1 ', 'laneId')).toBe('lane-1');
    expect(() => requiredText(' \t', 'laneId')).toThrow(new Error('laneId is required'));
  });

  it('trims optional text and turns blank or missing text into null', () => {
    expect(optionalText(' note ')).toBe('note');
    expect(optionalText('  ')).toBeNull();
    expect(optionalText(null)).toBeNull();
    expect(optionalText(undefined)).toBeNull();
  });

  it('accepts positive integers only', () => {
    expect(positiveInteger(3, 'shots')).toBe(3);
    for (const value of [0, -1, 1.5, Number.NaN]) {
      expect(() => positiveInteger(value, 'shots')).toThrow(new Error('shots must be a positive integer'));
    }
  });

  it('accepts non-negative integers only', () => {
    expect(nonNegativeInteger(0, 'index')).toBe(0);
    for (const value of [-1, 0.5, Number.POSITIVE_INFINITY]) {
      expect(() => nonNegativeInteger(value, 'index')).toThrow(new Error('index must be a non-negative integer'));
    }
  });

  it('copies valid dates and keeps the two failure wordings', () => {
    const at = new Date('2026-01-15T10:00:00Z');
    const copy = validDate(at, 'decidedAt');
    expect(copy).toEqual(at);
    expect(copy).not.toBe(at);
    expect(validTime(at, 'stoppedAt')).toEqual(at);
    expect(() => validDate(new Date(Number.NaN), 'decidedAt')).toThrow(new Error('decidedAt must be a valid date'));
    expect(() => validTime(new Date(Number.NaN), 'stoppedAt')).toThrow(new Error('stoppedAt must be valid'));
  });
});
