import { describe, it, expect, beforeEach } from 'vitest';
import { IssfStandardStrategy } from '@/shared/competitionTypes/strategies/IssfStandardStrategy';
import type { ResultFormat } from '@/shared/competitionTypes';
import type { RankingShotEvidence } from '@/shared/competitionTypes';
import { competitionTypeFromRulePack } from '@/shared/competitionTypes';
import { ISSF_2026_RFPM, ISSF_2026_STDP, ISSF_2026_P25, ISSF_2026_CFP } from '@sasakiuri/saika-rules';

describe('IssfStandardStrategy', () => {
  let strategy: IssfStandardStrategy;

  const defaultFormat: ResultFormat = {
    totalShots: 60,
    totalSeries: 6,
    stage1Shots: 10,
  };

  const smallFormat: ResultFormat = {
    totalShots: 40,
    totalSeries: 4,
    stage1Shots: 5,
  };

  beforeEach(() => {
    strategy = new IssfStandardStrategy();
  });

  it('should have id "standard"', () => {
    expect(strategy.id).toBe('standard');
  });

  describe('padShots', () => {
    it('should pad empty array to totalShots with zeros', () => {
      const result = strategy.padShots([], defaultFormat);

      expect(result).toHaveLength(60);
      expect(result.every((s) => s === 0)).toBe(true);
    });

    it('should pad partial array to totalShots', () => {
      const shots = [10, 9, 10, 8, 7];
      const result = strategy.padShots(shots, defaultFormat);

      expect(result).toHaveLength(60);
      expect(result.slice(0, 5)).toEqual([10, 9, 10, 8, 7]);
      expect(result.slice(5).every((s) => s === 0)).toBe(true);
    });

    it('should leave already-full array unchanged', () => {
      const shots = Array.from({ length: 60 }, (_, i) => i % 11);
      const result = strategy.padShots(shots, defaultFormat);

      expect(result).toHaveLength(60);
      expect(result).toEqual(shots);
    });

    it('should not mutate the original array', () => {
      const shots = [10, 9];
      const original = [...shots];
      strategy.padShots(shots, defaultFormat);

      expect(shots).toEqual(original);
    });

    it('should work with different format values (40 shots)', () => {
      const shots = [10, 9, 8];
      const result = strategy.padShots(shots, smallFormat);

      expect(result).toHaveLength(40);
      expect(result.slice(0, 3)).toEqual([10, 9, 8]);
      expect(result.slice(3).every((s) => s === 0)).toBe(true);
    });
  });

  describe('padSeries', () => {
    it('should pad empty array to totalSeries with zeros', () => {
      const result = strategy.padSeries([], defaultFormat);

      expect(result).toHaveLength(6);
      expect(result.every((s) => s === 0)).toBe(true);
    });

    it('should pad partial array to totalSeries', () => {
      const series = [98, 95, 100];
      const result = strategy.padSeries(series, defaultFormat);

      expect(result).toHaveLength(6);
      expect(result.slice(0, 3)).toEqual([98, 95, 100]);
      expect(result.slice(3)).toEqual([0, 0, 0]);
    });

    it('should leave already-full array unchanged', () => {
      const series = [98, 95, 100, 97, 99, 96];
      const result = strategy.padSeries(series, defaultFormat);

      expect(result).toHaveLength(6);
      expect(result).toEqual(series);
    });

    it('should not mutate the original array', () => {
      const series = [98];
      const original = [...series];
      strategy.padSeries(series, defaultFormat);

      expect(series).toEqual(original);
    });

    it('should work with different format values (4 series)', () => {
      const series = [90, 85];
      const result = strategy.padSeries(series, smallFormat);

      expect(result).toHaveLength(4);
      expect(result.slice(0, 2)).toEqual([90, 85]);
      expect(result.slice(2)).toEqual([0, 0]);
    });
  });

  describe('compareResults', () => {
    it.each([ISSF_2026_RFPM, ISSF_2026_STDP, ISSF_2026_P25, ISSF_2026_CFP])(
      'compares ten-shot blocks before individual shots for five-shot series ($id)',
      (pack) => {
        const format = competitionTypeFromRulePack(pack).resultFormat;
        const a = {
          totalScore: 593,
          seriesScores: [...Array(10).fill(50), 45, 48],
          shots: [...Array(50).fill(10), 9, 9, 9, 9, 9, 10, 10, 10, 10, 8],
        };
        const b = {
          totalScore: 593,
          seriesScores: [...Array(10).fill(50), 48, 45],
          shots: [...Array(50).fill(10), 10, 10, 10, 9, 9, 9, 9, 9, 9, 9],
        };
        // Both last ten-shot blocks total 93; B wins on the last shot (9 versus 8).
        // Comparing the final five-shot series alone would incorrectly rank A first.
        const checkedA = { ...a, rankingShots: evidence(a.shots, Array(60).fill(false)) };
        const checkedB = { ...b, rankingShots: evidence(b.shots, Array(60).fill(false)) };
        expect(strategy.compareResults(checkedA, checkedB, format)).toBeGreaterThan(0);
        expect(strategy.compareResults(checkedB, checkedA, format)).toBeLessThan(0);
      },
    );

    it('uses adjusted ten-shot block totals before the last shot and preserves a local series policy', () => {
      const format = competitionTypeFromRulePack(ISSF_2026_RFPM).resultFormat;
      const a = { totalScore: 590, seriesScores: [...Array(10).fill(50), 45, 45], shots: [...Array(59).fill(10), 10] };
      const b = {
        totalScore: 590,
        seriesScores: [...Array(9).fill(50), 49, 45, 46],
        shots: [...Array(59).fill(10), 9],
      };
      expect(
        strategy.compareResults(
          { ...a, rankingShots: evidence(a.shots, Array(60).fill(false)) },
          { ...b, rankingShots: evidence(b.shots, Array(60).fill(false)) },
          format,
        ),
      ).toBeGreaterThan(0);
      const tiedA = { totalScore: 593, seriesScores: [...Array(10).fill(50), 45, 48], shots: [] };
      const tiedB = { totalScore: 593, seriesScores: [...Array(10).fill(50), 48, 45], shots: [] };
      const { tieBreakPolicy: _policy, ...localFormat } = format;
      expect(strategy.compareResults(tiedA, tiedB, localFormat)).toBeLessThan(0);
    });

    it('should return negative when a has higher totalScore', () => {
      const a = { totalScore: 590, seriesScores: [98, 98, 98, 99, 99, 98], shots: [] as number[] };
      const b = { totalScore: 580, seriesScores: [97, 97, 97, 97, 96, 96], shots: [] as number[] };

      const result = strategy.compareResults(a, b, defaultFormat);

      expect(result).toBeLessThan(0);
    });

    it('should return positive when b has higher totalScore', () => {
      const a = { totalScore: 580, seriesScores: [97, 97, 97, 97, 96, 96], shots: [] as number[] };
      const b = { totalScore: 590, seriesScores: [98, 98, 98, 99, 99, 98], shots: [] as number[] };

      const result = strategy.compareResults(a, b, defaultFormat);

      expect(result).toBeGreaterThan(0);
    });

    it('should return negative when same total but a has higher last series', () => {
      const a = { totalScore: 580, seriesScores: [96, 96, 97, 97, 97, 97], shots: [] as number[] };
      const b = { totalScore: 580, seriesScores: [97, 97, 97, 97, 96, 96], shots: [] as number[] };

      // Last series (index 5): a=97, b=96 → a ranks higher → negative
      const result = strategy.compareResults(a, b, defaultFormat);

      expect(result).toBeLessThan(0);
    });

    it('should return positive when same total but b has higher last series', () => {
      const a = { totalScore: 580, seriesScores: [97, 97, 97, 97, 96, 96], shots: [] as number[] };
      const b = { totalScore: 580, seriesScores: [96, 96, 97, 97, 97, 97], shots: [] as number[] };

      // Last series (index 5): a=96, b=97 → b ranks higher → positive
      const result = strategy.compareResults(a, b, defaultFormat);

      expect(result).toBeGreaterThan(0);
    });

    it('should return negative when same total and series but a has higher last shot', () => {
      const aShots = Array.from({ length: 60 }, () => 10);
      const bShots = Array.from({ length: 60 }, () => 10);
      // Make last shot different
      aShots[59] = 10;
      bShots[59] = 9;

      const a = { totalScore: 590, seriesScores: [98, 98, 98, 99, 99, 98], shots: aShots };
      const b = { totalScore: 590, seriesScores: [98, 98, 98, 99, 99, 98], shots: bShots };

      const result = strategy.compareResults(a, b, defaultFormat);

      expect(result).toBeLessThan(0);
    });

    it('should return 0 for complete tie', () => {
      const shots = Array.from({ length: 60 }, () => 10);
      const series = [100, 100, 100, 100, 100, 100];

      const a = { totalScore: 600, seriesScores: series, shots };
      const b = { totalScore: 600, seriesScores: [...series], shots: [...shots] };

      const result = strategy.compareResults(a, b, defaultFormat);

      expect(result).toBe(0);
    });

    it('should handle missing series scores gracefully (treat as 0)', () => {
      const a = { totalScore: 100, seriesScores: [100], shots: [] as number[] };
      const b = { totalScore: 100, seriesScores: [] as number[], shots: [] as number[] };

      // Series comparison: last series (index 5): a=0, b=0 … index 0: a=100, b=0 → a ranks higher
      const result = strategy.compareResults(a, b, defaultFormat);

      expect(result).toBeLessThan(0);
    });

    it('should handle missing shot scores gracefully (treat as 0)', () => {
      const a = { totalScore: 100, seriesScores: [100, 0, 0, 0, 0, 0], shots: [10] };
      const b = { totalScore: 100, seriesScores: [100, 0, 0, 0, 0, 0], shots: [] as number[] };

      // Shot comparison: last shot (index 59): both 0 … index 0: a=10, b=0 → a ranks higher
      const result = strategy.compareResults(a, b, defaultFormat);

      expect(result).toBeLessThan(0);
    });

    it('should work with different format values', () => {
      const a = { totalScore: 400, seriesScores: [100, 100, 100, 100], shots: Array.from({ length: 40 }, () => 10) };
      const b = { totalScore: 400, seriesScores: [100, 100, 100, 100], shots: Array.from({ length: 40 }, () => 10) };

      const result = strategy.compareResults(a, b, smallFormat);

      expect(result).toBe(0);
    });

    it('should compare series in reverse order (last series first)', () => {
      // Same total, series differ only in the middle
      const a = { totalScore: 580, seriesScores: [96, 97, 97, 97, 97, 96], shots: [] as number[] };
      const b = { totalScore: 580, seriesScores: [97, 96, 97, 97, 97, 96], shots: [] as number[] };

      // Last series (5): both 96, series 4: both 97, series 3: both 97, series 2: both 97
      // series 1: a=97, b=96 → a ranks higher → negative
      const result = strategy.compareResults(a, b, defaultFormat);

      expect(result).toBeLessThan(0);
    });

    const evidence = (
      rings: number[],
      innerTens: boolean[],
      decimals: Array<number | null> = rings,
    ): RankingShotEvidence[] =>
      rings.map((ringScore, index) => ({
        ringScore,
        innerTen: innerTens[index] ?? false,
        decimalScore: decimals[index] ?? null,
        shotId: `shot-${index}`,
        seriesIndex: Math.floor(index / 2),
      }));

    const fullRingFormat: ResultFormat = {
      totalShots: 4,
      totalSeries: 2,
      tieBreakPolicy: 'ISSF_FULL_RING',
    };

    it('applies ISSF 6.15.1(a) inner-ten count before the last-series comparison', () => {
      const a = {
        totalScore: 38,
        seriesScores: [20, 18],
        shots: [10, 10, 9, 9],
        rankingShots: evidence([10, 10, 9, 9], [true, true, false, false]),
      };
      const b = {
        totalScore: 38,
        seriesScores: [18, 20],
        shots: [9, 9, 10, 10],
        rankingShots: evidence([9, 9, 10, 10], [false, false, true, false]),
      };

      expect(strategy.compareResults(a, b, fullRingFormat)).toBeLessThan(0);
    });

    it('applies ISSF 6.15.1(c) reverse-shot X distinction when X counts are equal', () => {
      const a = {
        totalScore: 40,
        seriesScores: [20, 20],
        shots: [10, 10, 10, 10],
        rankingShots: evidence([10, 10, 10, 10], [false, false, false, true]),
      };
      const b = {
        totalScore: 40,
        seriesScores: [20, 20],
        shots: [10, 10, 10, 10],
        rankingShots: evidence([10, 10, 10, 10], [true, false, false, false]),
      };

      expect(strategy.compareResults(a, b, fullRingFormat)).toBeLessThan(0);
    });

    it('applies ISSF 6.15.1(d) reverse-shot EST decimals after full-ring criteria', () => {
      const a = {
        totalScore: 40,
        seriesScores: [20, 20],
        shots: [10, 10, 10, 10],
        rankingShots: evidence([10, 10, 10, 10], [false, false, false, false], [10.1, 10.1, 10.1, 10.4]),
      };
      const b = {
        totalScore: 40,
        seriesScores: [20, 20],
        shots: [10, 10, 10, 10],
        rankingShots: evidence([10, 10, 10, 10], [false, false, false, false], [10.1, 10.1, 10.1, 10.3]),
      };

      expect(strategy.compareResults(a, b, fullRingFormat)).toBeLessThan(0);
    });

    it('applies ISSF 6.15.1(f) decimal-rifle series and ignores the inner-ten-count branch', () => {
      const decimalFormat: ResultFormat = {
        totalShots: 4,
        totalSeries: 2,
        tieBreakPolicy: 'ISSF_DECIMAL_RIFLE',
      };
      const a = {
        totalScore: 40,
        seriesScores: [20.5, 19.5],
        shots: [10.3, 10.2, 9.7, 9.8],
        rankingShots: evidence([10, 10, 9, 9], [true, true, true, true]),
      };
      const b = {
        totalScore: 40,
        seriesScores: [19.5, 20.5],
        shots: [9.7, 9.8, 10.3, 10.2],
        rankingShots: evidence([9, 9, 10, 10], [false, false, false, false]),
      };

      expect(strategy.compareResults(a, b, decimalFormat)).toBeGreaterThan(0);
    });

    it('orders an unresolved tie by family name without changing the ranking comparison', () => {
      const a = { totalScore: 40, seriesScores: [20, 20], shots: [10, 10, 10, 10], familyName: 'Zulu' };
      const b = { totalScore: 40, seriesScores: [20, 20], shots: [10, 10, 10, 10], familyName: 'Adams' };

      expect(strategy.compareResults(a, b, fullRingFormat)).toBe(0);
      expect(strategy.compareEqualResultsForDisplay(a, b)).toBeGreaterThan(0);
    });
  });

  describe('splitFinalStages', () => {
    it('should split correctly at stage1Shots boundary', () => {
      const matchShots = [10, 9, 10, 10, 9, 10, 10, 10, 9, 10, 10, 9, 10, 10, 10, 10, 9, 10, 10, 10, 9, 10, 10, 10];
      const result = strategy.splitFinalStages(matchShots, defaultFormat);

      expect(result.stage1Shots).toEqual(matchShots.slice(0, 10));
      expect(result.stage2Shots).toEqual(matchShots.slice(10));
      expect(result.stage1Shots).toHaveLength(10);
      expect(result.stage2Shots).toHaveLength(14);
    });

    it('should handle array shorter than stage 1', () => {
      const matchShots = [10, 9, 10];
      const result = strategy.splitFinalStages(matchShots, defaultFormat);

      expect(result.stage1Shots).toEqual([10, 9, 10]);
      expect(result.stage2Shots).toEqual([]);
    });

    it('should handle empty array', () => {
      const result = strategy.splitFinalStages([], defaultFormat);

      expect(result.stage1Shots).toEqual([]);
      expect(result.stage2Shots).toEqual([]);
    });

    it('should handle array with exactly stage 1 shots', () => {
      const matchShots = Array.from({ length: 10 }, () => 10);
      const result = strategy.splitFinalStages(matchShots, defaultFormat);

      expect(result.stage1Shots).toHaveLength(10);
      expect(result.stage2Shots).toEqual([]);
    });

    it('should work with different format values (stage1Shots = 5)', () => {
      const matchShots = [10, 9, 10, 10, 9, 10, 10, 10];
      const result = strategy.splitFinalStages(matchShots, smallFormat);

      expect(result.stage1Shots).toEqual([10, 9, 10, 10, 9]);
      expect(result.stage2Shots).toEqual([10, 10, 10]);
    });

    it('should not mutate the original array', () => {
      const matchShots = [10, 9, 10, 10, 9, 10, 10, 10, 9, 10, 10, 9];
      const original = [...matchShots];
      strategy.splitFinalStages(matchShots, defaultFormat);

      expect(matchShots).toEqual(original);
    });
  });
});
