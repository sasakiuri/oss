import { describe, expect, it } from 'vitest';

import type { QualificationRankingInput, ResultFormat } from '@/shared/competitionTypes';
import { IssfStandardStrategy } from '@/shared/competitionTypes/strategies/IssfStandardStrategy';

const strategy = new IssfStandardStrategy();
const format: ResultFormat = { totalShots: 60, totalSeries: 6, tieBreakPolicy: 'ISSF_FULL_RING' };
function result(seriesScores: number[], innerTens: number): QualificationRankingInput {
  const shots = seriesScores.flatMap((score) =>
    Array.from({ length: 10 }, (_, index) => (index < score - 90 ? 10 : 9)),
  );
  let remaining = innerTens;
  return {
    totalScore: seriesScores.reduce((sum, score) => sum + score, 0),
    seriesScores,
    shots,
    rankingShots: shots.map((ringScore, index) => ({
      ringScore,
      decimalScore: ringScore === 10 ? 10.5 : 9.5,
      innerTen: ringScore === 10 && remaining-- > 0,
      shotId: String(index),
      seriesIndex: Math.floor(index / 10),
    })),
  };
}

describe('ISSF qualification comparison evidence', () => {
  it('never reverses a provably larger X count because one other shot is unknown', () => {
    const a = result([100, 100, 100, 100, 100, 90], 20);
    const b = result([90, 100, 100, 100, 100, 100], 10);
    const partial = {
      ...a,
      rankingShots: a.rankingShots!.map((shot, index) => (index === 20 ? { ...shot, innerTen: null } : shot)),
    };
    expect(strategy.assessComparison(partial, b, format)).toEqual({ comparison: -1, issues: [] });
    expect(strategy.assessComparison(b, partial, format)).toEqual({ comparison: 1, issues: [] });
  });

  it('does not fall through an uncertain X count to the last series', () => {
    const a = result([100, 100, 100, 100, 100, 90], 10);
    const b = result([90, 100, 100, 100, 100, 100], 10);
    const partial = {
      ...a,
      rankingShots: a.rankingShots!.map((shot, index) => (index === 20 ? { ...shot, innerTen: null } : shot)),
    };
    expect(strategy.assessComparison(partial, b, format)).toMatchObject({
      comparison: 0,
      issues: [expect.stringContaining('inner-ten count')],
    });
    expect(strategy.assessComparison(a, b, format).comparison).toBeGreaterThan(0);
  });

  it('distinguishes unavailable EST decimals from a proven equal rank', () => {
    const a = result([100, 100, 100, 100, 100, 100], 10);
    const partial = {
      ...a,
      rankingShots: a.rankingShots!.map((shot, index) => (index === 59 ? { ...shot, decimalScore: null } : shot)),
    };
    expect(strategy.assessComparison(partial, a, format)).toMatchObject({
      comparison: 0,
      issues: [expect.stringContaining('EST decimal')],
    });
    expect(strategy.assessComparison(a, a, format)).toEqual({ comparison: 0, issues: [] });
  });

  it('does not require unused criteria when total or decimal series already establish the order', () => {
    expect(
      strategy.assessComparison(result([90, 90, 90, 90, 90, 90], 0), result([100, 100, 100, 100, 100, 100], 0), format)
        .issues,
    ).toEqual([]);
    const a = { totalScore: 590, seriesScores: [100, 100, 100, 100, 100, 90], shots: [] };
    const b = { ...a, seriesScores: [90, 100, 100, 100, 100, 100] };
    expect(strategy.assessComparison(a, b, { ...format, tieBreakPolicy: 'ISSF_DECIMAL_RIFLE' })).toEqual({
      comparison: 10,
      issues: [],
    });
    expect(strategy.assessComparison(a, a, { ...format, tieBreakPolicy: 'ISSF_DECIMAL_RIFLE' }).issues).toEqual([
      expect.stringContaining('shot countback'),
    ]);
  });
});
