// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import {
  countShotValues,
  extractSeriesNumbers,
  formatShotValue,
  getSeriesIntegerScore,
  getSeriesShots,
} from '@/renderer/presentation/screens/print/scoreSheetUtils';
import type { ScoreSheetShotDto } from '@/shared/ipc/contracts';

function shot(seriesNumber: number, shotNumber: number, value: number, integerValue: number): ScoreSheetShotDto {
  return { seriesNumber, shotNumber, value, integerValue, x: null, y: null };
}

describe('scoreSheetUtils', () => {
  describe('countShotValues', () => {
    it('returns all-zero counts for an empty array', () => {
      const result = countShotValues([]);
      expect(result).toHaveLength(11);
      expect(result.every((c) => c === 0)).toBe(true);
    });

    it('correctly counts 10s and 9s', () => {
      const shots = [shot(1, 1, 105, 10), shot(1, 2, 102, 10), shot(1, 3, 98, 9)];
      const result = countShotValues(shots);
      expect(result[0]).toBe(2); // 10: 2 times
      expect(result[1]).toBe(1); // 9: 1 time
      expect(result[2]).toBe(0); // 8: 0 times
    });

    it('correctly counts 0s', () => {
      const shots = [shot(1, 1, 0, 0)];
      const result = countShotValues(shots);
      expect(result[10]).toBe(1); // 0: index 10
    });

    it('ignores out-of-range values', () => {
      const shots = [shot(1, 1, -10, -1), shot(1, 2, 110, 11)];
      const result = countShotValues(shots);
      expect(result.every((c) => c === 0)).toBe(true);
    });

    it('handles mixed scores of all values', () => {
      const shots = Array.from({ length: 11 }, (_, i) => shot(1, i + 1, i * 10, i));
      const result = countShotValues(shots);
      // Each score appears once
      expect(result.every((c) => c === 1)).toBe(true);
    });
  });

  describe('getSeriesShots', () => {
    const allShots = [shot(2, 2, 90, 9), shot(1, 1, 100, 10), shot(1, 2, 95, 9), shot(2, 1, 80, 8)];

    it('returns only shots from the specified series', () => {
      const result = getSeriesShots(allShots, 1);
      expect(result).toHaveLength(2);
      expect(result.every((s) => s.seriesNumber === 1)).toBe(true);
    });

    it('returns shots sorted by shotNumber in ascending order', () => {
      const result = getSeriesShots(allShots, 1);
      expect(result[0]!.shotNumber).toBe(1);
      expect(result[1]!.shotNumber).toBe(2);
    });

    it('returns an empty array for a non-existent series number', () => {
      expect(getSeriesShots(allShots, 99)).toEqual([]);
    });

    it('returns an empty array for an empty array', () => {
      expect(getSeriesShots([], 1)).toEqual([]);
    });
  });

  describe('getSeriesIntegerScore', () => {
    const allShots = [shot(1, 1, 105, 10), shot(1, 2, 98, 9), shot(2, 1, 85, 8)];

    it('returns the integer total score of a series', () => {
      expect(getSeriesIntegerScore(allShots, 1)).toBe(19);
    });

    it('handles a single-shot series', () => {
      expect(getSeriesIntegerScore(allShots, 2)).toBe(8);
    });

    it('returns 0 for a non-existent series', () => {
      expect(getSeriesIntegerScore(allShots, 99)).toBe(0);
    });
  });

  describe('formatShotValue', () => {
    it('formats the shot value with one decimal place', () => {
      expect(formatShotValue(shot(1, 1, 105, 10))).toBe('10.5');
    });

    it('displays integer values with one decimal place', () => {
      expect(formatShotValue(shot(1, 1, 90, 9))).toBe('9.0');
    });

    it('returns "-" for undefined', () => {
      expect(formatShotValue(undefined)).toBe('-');
    });

    it('correctly formats a score of 0', () => {
      expect(formatShotValue(shot(1, 1, 0, 0))).toBe('0.0');
    });
  });

  describe('extractSeriesNumbers', () => {
    it('returns unique series numbers in ascending order', () => {
      const shots = [shot(3, 1, 100, 10), shot(1, 1, 90, 9), shot(1, 2, 80, 8), shot(2, 1, 70, 7)];
      expect(extractSeriesNumbers(shots)).toEqual([1, 2, 3]);
    });

    it('returns an empty array for an empty array', () => {
      expect(extractSeriesNumbers([])).toEqual([]);
    });

    it('handles a single series', () => {
      const shots = [shot(5, 1, 100, 10), shot(5, 2, 90, 9)];
      expect(extractSeriesNumbers(shots)).toEqual([5]);
    });
  });
});
