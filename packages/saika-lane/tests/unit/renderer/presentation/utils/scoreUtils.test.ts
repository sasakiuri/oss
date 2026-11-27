// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import {
  calculateMatchSeriesScores,
  calculateSeriesScores,
  DISCIPLINE_LABELS,
  formatScore,
  toArrowDirection,
} from '@/renderer/presentation/utils/scoreUtils';

describe('scoreUtils', () => {
  describe('DISCIPLINE_LABELS', () => {
    it('labels are defined for all 8 disciplines', () => {
      expect(Object.keys(DISCIPLINE_LABELS)).toHaveLength(8);
      expect(DISCIPLINE_LABELS.AIR_RIFLE_10M).toBe('10m Air Rifle');
      expect(DISCIPLINE_LABELS.AIR_PISTOL_10M).toBe('10m Air Pistol');
      expect(DISCIPLINE_LABELS.RIFLE_50M).toBe('50m Rifle');
      expect(DISCIPLINE_LABELS.RIFLE_300M).toBe('300m Rifle');
      expect(DISCIPLINE_LABELS.PISTOL_50M).toBe('50m Pistol');
      expect(DISCIPLINE_LABELS.PISTOL_25M).toBe('25m Pistol');
      expect(DISCIPLINE_LABELS.BEAM_RIFLE_10M).toBe('10m Beam Rifle');
      expect(DISCIPLINE_LABELS.BEAM_PISTOL_10M).toBe('10m Beam Pistol');
    });
  });

  describe('toArrowDirection', () => {
    it('returns "•" at origin', () => {
      expect(toArrowDirection(0, 0)).toBe('•');
    });

    it("returns '↑' for 12 o'clock direction (+Y axis)", () => {
      expect(toArrowDirection(0, 5)).toBe('↑');
    });

    it("returns '→' for 3 o'clock direction (+X axis)", () => {
      expect(toArrowDirection(5, 0)).toBe('→');
    });

    it("returns '↓' for 6 o'clock direction (-Y axis)", () => {
      expect(toArrowDirection(0, -5)).toBe('↓');
    });

    it("returns '←' for 9 o'clock direction (-X axis)", () => {
      expect(toArrowDirection(-5, 0)).toBe('←');
    });

    it("returns '↗' for 1-2 o'clock direction", () => {
      expect(toArrowDirection(3, 5)).toBe('↗');
    });

    it("returns '↘' for 4-5 o'clock direction", () => {
      expect(toArrowDirection(5, -3)).toBe('↘');
    });

    it("returns '↙' for 7-8 o'clock direction", () => {
      expect(toArrowDirection(-5, -3)).toBe('↙');
    });

    it("returns '↖' for 10-11 o'clock direction", () => {
      expect(toArrowDirection(-3, 5)).toBe('↖');
    });

    it('returns the correct direction even for small coordinate values', () => {
      expect(toArrowDirection(0.1, 0)).toBe('→');
      expect(toArrowDirection(0, 0.1)).toBe('↑');
    });
  });

  describe('calculateSeriesScores', () => {
    describe('10 shots per series', () => {
      it('returns empty array for empty array', () => {
        expect(calculateSeriesScores([], 10)).toEqual([]);
      });

      it('returns one series for a single shot', () => {
        expect(calculateSeriesScores([{ score: 10.5 }], 10)).toEqual([10.5]);
      });

      it('returns one series score for 10 shots', () => {
        const shots = [
          { score: 10 },
          { score: 9 },
          { score: 10 },
          { score: 8 },
          { score: 10 },
          { score: 9 },
          { score: 10 },
          { score: 10 },
          { score: 9 },
          { score: 10 },
        ];

        const result = calculateSeriesScores(shots, 10);

        expect(result).toEqual([95]);
      });

      it('returns two series scores for 20 shots', () => {
        const series1 = Array.from({ length: 10 }, () => ({ score: 10 }));
        const series2 = Array.from({ length: 10 }, () => ({ score: 9 }));
        const shots = [...series1, ...series2];

        const result = calculateSeriesScores(shots, 10);

        expect(result).toEqual([100, 90]);
      });

      it('calculates incomplete series', () => {
        const shots = Array.from({ length: 15 }, () => ({ score: 10 }));

        const result = calculateSeriesScores(shots, 10);

        expect(result).toEqual([100, 50]);
      });
    });

    describe('custom shotsPerSeries', () => {
      it('calculates series scores every 5 shots with shotsPerSeries=5', () => {
        const shots = Array.from({ length: 10 }, () => ({ score: 10 }));

        const result = calculateSeriesScores(shots, 5);

        expect(result).toEqual([50, 50]);
      });

      it('calculates series scores every 20 shots with shotsPerSeries=20', () => {
        const shots = Array.from({ length: 20 }, () => ({ score: 9 }));

        const result = calculateSeriesScores(shots, 20);

        expect(result).toEqual([180]);
      });

      it('returns score per shot with shotsPerSeries=1', () => {
        const shots = [{ score: 10 }, { score: 9 }, { score: 8 }];

        const result = calculateSeriesScores(shots, 1);

        expect(result).toEqual([10, 9, 8]);
      });

      it('returns empty array with custom shotsPerSeries for empty array', () => {
        expect(calculateSeriesScores([], 5)).toEqual([]);
      });

      it('calculates incomplete series with custom shotsPerSeries', () => {
        const shots = [{ score: 10 }, { score: 9 }, { score: 8 }];

        const result = calculateSeriesScores(shots, 5);

        expect(result).toEqual([27]);
      });
    });

    describe('decimal scores', () => {
      it('sums decimal scores correctly', () => {
        const shots = [
          { score: 10.5 },
          { score: 10.3 },
          { score: 9.8 },
          { score: 10.1 },
          { score: 10.7 },
          { score: 9.9 },
          { score: 10.0 },
          { score: 10.4 },
          { score: 9.6 },
          { score: 10.2 },
        ];

        const result = calculateSeriesScores(shots, 10);
        const total = result[0]!;

        // Compare with approximate values due to floating-point arithmetic
        expect(total).toBeCloseTo(101.5, 1);
      });
    });
  });

  describe('calculateMatchSeriesScores', () => {
    const placed = (score: number, stageIndex: number, seriesIndex: number) => ({
      score,
      competitionContext: { competitionId: 'competition', stageIndex, seriesIndex },
    });

    it('totals each competition series of a Final, whatever its number of shots', () => {
      const shots = [
        ...Array.from({ length: 5 }, () => placed(100, 1, 0)),
        ...Array.from({ length: 5 }, () => placed(101, 1, 1)),
        placed(104, 2, 0),
        placed(98, 2, 1),
      ];

      expect(calculateMatchSeriesScores(shots, 5)).toEqual([500, 505, 104, 98]);
    });

    it('keeps a series in progress separate from the completed one', () => {
      const shots = [...Array.from({ length: 10 }, () => placed(100, 1, 0)), placed(105, 1, 1)];

      expect(calculateMatchSeriesScores(shots, 10)).toEqual([1000, 105]);
    });

    it('fills series of shotsPerSeries with shots recorded outside a competition', () => {
      const shots = Array.from({ length: 12 }, () => ({ score: 100, competitionContext: null }));

      expect(calculateMatchSeriesScores(shots, 10)).toEqual([1000, 200]);
    });
  });

  describe('formatScore', () => {
    it('shows whole rings rounded down for RING scoring', () => {
      expect(formatScore(109, 'RING')).toBe('10');
      expect(formatScore(1045, 'RING')).toBe('104');
      expect(formatScore(0, 'RING')).toBe('0');
    });

    it('shows one decimal otherwise', () => {
      expect(formatScore(109, 'DECIMAL')).toBe('10.9');
      expect(formatScore(1045, 'DECIMAL')).toBe('104.5');
      expect(formatScore(0, 'DECIMAL')).toBe('0.0');
    });
  });
});
