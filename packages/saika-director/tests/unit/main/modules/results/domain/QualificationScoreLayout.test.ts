import { describe, expect, it } from 'vitest';
import { ISSF_2026_RFPM, ISSF_2026_ARMIX30 } from '@sasakiuri/saika-rules';
import { competitionTypeFromRulePack } from '@/shared/competitionTypes';
import { layoutQualificationScoreSeries } from '@/main/modules/results/domain/QualificationScoreLayout';
import { assembleRankingEvidence } from '@/main/modules/results/domain/RankingEvidenceAssembler';

describe('Qualification source layout', () => {
  const definition = competitionTypeFromRulePack(ISSF_2026_RFPM);
  it('keeps later shots in their declared series when a prior series ends early', () => {
    const layout = layoutQualificationScoreSeries(definition, [
      { stageIndex: 1, seriesIndex: 1, scoresX10: [100, 100, 100, 100, 100], totalX10: 500 },
      { stageIndex: 1, seriesIndex: 0, scoresX10: [90, 100], totalX10: 190 },
    ]);
    expect(layout).toHaveLength(12);
    expect(layout.flatMap((s) => s.scoresX10).slice(0, 10)).toEqual([90, 100, 0, 0, 0, 100, 100, 100, 100, 100]);
    const evidence = assembleRankingEvidence(layout, [
      {
        stageIndex: 1,
        seriesIndex: 1,
        shotNumberInSeries: 1,
        shotId: 'next-series',
        effectiveScoreX10: 100,
        deviceScoreX10: null,
        calculatedScoreX10: 100,
        calculatedScoreAvailable: false,
        innerTen: false,
      },
    ]);
    expect(evidence[5]!.shotId).toBe('next-series');
    expect(evidence.slice(2, 5).every((shot) => shot.shotId === null && shot.innerTen === null)).toBe(true);
  });
  it('retains all thirty slots for a shorter Mixed Team course without padding to sixty', () => {
    const layout = layoutQualificationScoreSeries(competitionTypeFromRulePack(ISSF_2026_ARMIX30), []);
    expect(layout).toHaveLength(3);
    expect(layout.flatMap((s) => s.scoresX10)).toHaveLength(30);
  });
  it('rejects duplicate, unknown and overfull series instead of truncating evidence', () => {
    const series = { stageIndex: 1, seriesIndex: 0, scoresX10: [90], totalX10: 90 };
    expect(() => layoutQualificationScoreSeries(definition, [series, series])).toThrow('duplicate');
    expect(() => layoutQualificationScoreSeries(definition, [{ ...series, seriesIndex: 99 }])).toThrow('unknown');
    expect(() => layoutQualificationScoreSeries(definition, [{ ...series, scoresX10: Array(6).fill(90) }])).toThrow(
      'exceeds',
    );
  });
});
