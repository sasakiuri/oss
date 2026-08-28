import { describe, expect, it } from 'vitest';

import { assembleRankingEvidence } from '@/main/modules/results/domain/RankingEvidenceAssembler';

describe('assembleRankingEvidence', () => {
  const series = [
    { stageIndex: 1, seriesIndex: 0, scoresX10: [100, 90] },
    { stageIndex: 1, seriesIndex: 1, scoresX10: [100] },
  ];

  it('attaches independent X and decimal evidence to the authoritative score positions', () => {
    const result = assembleRankingEvidence(series, [
      {
        shotId: 'shot-1',
        stageIndex: 1,
        seriesIndex: 0,
        shotNumberInSeries: 1,
        effectiveScoreX10: 100,
        calculatedScoreX10: 104,
        calculatedScoreAvailable: true,
        innerTen: true,
      },
      // A repeat delivery of the same shot must not make the position ambiguous.
      {
        shotId: 'shot-1',
        stageIndex: 1,
        seriesIndex: 0,
        shotNumberInSeries: 1,
        effectiveScoreX10: 100,
        calculatedScoreX10: 104,
        calculatedScoreAvailable: true,
        innerTen: true,
      },
    ]);

    expect(result).toEqual([
      { ringScore: 10, decimalScore: 10.4, innerTen: true, shotId: 'shot-1', seriesIndex: 0 },
      { ringScore: 9, decimalScore: null, innerTen: null, shotId: null, seriesIndex: 0 },
      { ringScore: 10, decimalScore: null, innerTen: null, shotId: null, seriesIndex: 1 },
    ]);
  });

  it('does not attach a mismatched or ambiguous observation', () => {
    const base = {
      stageIndex: 1,
      seriesIndex: 0,
      shotNumberInSeries: 1,
      effectiveScoreX10: 100,
      calculatedScoreX10: 103,
      calculatedScoreAvailable: true,
      innerTen: false,
    };
    const result = assembleRankingEvidence(series.slice(0, 1), [
      { ...base, shotId: 'shot-a' },
      { ...base, shotId: 'shot-b' },
      { ...base, shotId: 'wrong-score', shotNumberInSeries: 2, effectiveScoreX10: 80 },
    ]);

    expect(result).toEqual([
      { ringScore: 10, decimalScore: null, innerTen: null, shotId: null, seriesIndex: 0 },
      { ringScore: 9, decimalScore: null, innerTen: null, shotId: null, seriesIndex: 0 },
    ]);
  });

  it('does not claim independent decimal evidence for a legacy payload', () => {
    const result = assembleRankingEvidence(series.slice(0, 1), [
      {
        shotId: 'legacy-shot',
        stageIndex: 1,
        seriesIndex: 0,
        shotNumberInSeries: 1,
        effectiveScoreX10: 100,
        calculatedScoreX10: 100,
        calculatedScoreAvailable: false,
        innerTen: false,
      },
    ]);

    expect(result[0]).toMatchObject({ decimalScore: null, innerTen: false, shotId: 'legacy-shot' });
  });
});
