// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { calculateSeriesScores, DISCIPLINE_LABELS, toArrowDirection } from '@/renderer/presentation/utils/scoreUtils';

describe('DISCIPLINE_LABELS', () => {
  it('labels are defined for all 5 disciplines', () => {
    expect(Object.keys(DISCIPLINE_LABELS)).toHaveLength(5);
    expect(DISCIPLINE_LABELS.AIR_RIFLE_10M).toBe('10m Air Rifle');
    expect(DISCIPLINE_LABELS.AIR_PISTOL_10M).toBe('10m Air Pistol');
    expect(DISCIPLINE_LABELS.RIFLE_50M).toBe('50m Rifle');
    expect(DISCIPLINE_LABELS.PISTOL_25M).toBe('25m Pistol');
    expect(DISCIPLINE_LABELS.BEAM_RIFLE_10M).toBe('10m Beam Rifle');
  });
});

describe('toArrowDirection', () => {
  it('returns "." for center (0,0)', () => {
    expect(toArrowDirection(0, 0)).toBe('•');
  });

  it('returns up arrow for straight up (+Y)', () => {
    expect(toArrowDirection(0, 10)).toBe('↑');
  });

  it('returns down arrow for straight down (-Y)', () => {
    expect(toArrowDirection(0, -10)).toBe('↓');
  });

  it('returns right arrow for straight right (+X)', () => {
    expect(toArrowDirection(10, 0)).toBe('→');
  });

  it('returns left arrow for straight left (-X)', () => {
    expect(toArrowDirection(-10, 0)).toBe('←');
  });

  it('returns upper-right arrow for (+X,+Y)', () => {
    expect(toArrowDirection(10, 10)).toBe('↗');
  });

  it('returns lower-right arrow for (+X,-Y)', () => {
    expect(toArrowDirection(10, -10)).toBe('↘');
  });

  it('returns upper-left arrow for (-X,+Y)', () => {
    expect(toArrowDirection(-10, 10)).toBe('↖');
  });

  it('returns lower-left arrow for (-X,-Y)', () => {
    expect(toArrowDirection(-10, -10)).toBe('↙');
  });

  it('returns the correct direction even for small coordinate values', () => {
    expect(toArrowDirection(0.1, 0)).toBe('→');
    expect(toArrowDirection(0, 0.1)).toBe('↑');
  });
});

describe('calculateSeriesScores', () => {
  it('returns an empty array for an empty array', () => {
    expect(calculateSeriesScores([])).toEqual([]);
  });

  it('returns one series total for fewer than 10 shots', () => {
    const shots = [{ score: 10.5 }, { score: 9.8 }, { score: 10.2 }];
    const result = calculateSeriesScores(shots);
    expect(result).toHaveLength(1);
    expect(result[0]).toBeCloseTo(30.5);
  });

  it('returns one series total for exactly 10 shots', () => {
    const shots = Array.from({ length: 10 }, () => ({ score: 10.0 }));
    const result = calculateSeriesScores(shots);
    expect(result).toHaveLength(1);
    expect(result[0]).toBeCloseTo(100.0);
  });

  it('returns two series totals for 20 shots', () => {
    const series1 = Array.from({ length: 10 }, () => ({ score: 10.0 }));
    const series2 = Array.from({ length: 10 }, () => ({ score: 9.0 }));
    const result = calculateSeriesScores([...series1, ...series2]);
    expect(result).toHaveLength(2);
    expect(result[0]).toBeCloseTo(100.0);
    expect(result[1]).toBeCloseTo(90.0);
  });

  it('returns two series (10+5) for 15 shots', () => {
    const shots = Array.from({ length: 15 }, (_, i) => ({
      score: i < 10 ? 10.0 : 9.0,
    }));
    const result = calculateSeriesScores(shots);
    expect(result).toHaveLength(2);
    expect(result[0]).toBeCloseTo(100.0);
    expect(result[1]).toBeCloseTo(45.0);
  });

  it('returns 6 series for 60 shots', () => {
    const shots = Array.from({ length: 60 }, () => ({ score: 10.0 }));
    const result = calculateSeriesScores(shots);
    expect(result).toHaveLength(6);
    result.forEach((score) => expect(score).toBeCloseTo(100.0));
  });

  it('returns one series for a single shot', () => {
    const result = calculateSeriesScores([{ score: 10.5 }]);
    expect(result).toEqual([10.5]);
  });

  describe('shotsPerSeries parameter', () => {
    it('splits into series of 5 when shotsPerSeries=5', () => {
      const shots = Array.from({ length: 10 }, () => ({ score: 10.0 }));
      const result = calculateSeriesScores(shots, 5);
      expect(result).toHaveLength(2);
      expect(result[0]).toBeCloseTo(50.0);
      expect(result[1]).toBeCloseTo(50.0);
    });

    it('returns two series (5+2) for 7 shots when shotsPerSeries=5', () => {
      const shots = Array.from({ length: 7 }, (_, i) => ({
        score: i < 5 ? 10.0 : 9.0,
      }));
      const result = calculateSeriesScores(shots, 5);
      expect(result).toHaveLength(2);
      expect(result[0]).toBeCloseTo(50.0);
      expect(result[1]).toBeCloseTo(18.0);
    });

    it('splits into series of 20 when shotsPerSeries=20', () => {
      const shots = Array.from({ length: 40 }, () => ({ score: 9.5 }));
      const result = calculateSeriesScores(shots, 20);
      expect(result).toHaveLength(2);
      expect(result[0]).toBeCloseTo(190.0);
      expect(result[1]).toBeCloseTo(190.0);
    });

    it('default value (10) returns the same result as explicit shotsPerSeries=10', () => {
      const shots = Array.from({ length: 20 }, () => ({ score: 10.0 }));
      const defaultResult = calculateSeriesScores(shots);
      const explicitResult = calculateSeriesScores(shots, 10);
      expect(defaultResult).toEqual(explicitResult);
    });

    it('each shot becomes an individual series when shotsPerSeries=1', () => {
      const shots = [{ score: 10.5 }, { score: 9.8 }, { score: 10.2 }];
      const result = calculateSeriesScores(shots, 1);
      expect(result).toHaveLength(3);
      expect(result[0]).toBeCloseTo(10.5);
      expect(result[1]).toBeCloseTo(9.8);
      expect(result[2]).toBeCloseTo(10.2);
    });

    it('returns an empty array regardless of shotsPerSeries for an empty array', () => {
      expect(calculateSeriesScores([], 5)).toEqual([]);
      expect(calculateSeriesScores([], 20)).toEqual([]);
    });
  });
});
