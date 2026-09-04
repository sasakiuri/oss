import { describe, expect, it } from 'vitest';

import { applyResultClassificationOverlay } from '@/main/modules/results';
import type { ScoreDecisionProjection } from '@/main/modules/scoring-decisions';

describe('applyResultClassificationOverlay', () => {
  it('classifies without changing pre-classification evidence and composes audit references', () => {
    const projection: ScoreDecisionProjection = {
      totalScoreX10: 6120,
      scoreBeforeClassificationX10: 6120,
      seriesScoresX10: [1020, 1020, 1020, 1020, 1020, 1020],
      shotsX10: Array.from({ length: 60 }, () => 102),
      deductionTotalX10: 0,
      annulledScoreX10: 0,
      scoreAdjustmentX10: 0,
      classificationCode: null,
      remarks: [],
      activeDecisionIds: [],
      applications: [],
      issues: [],
    };

    const result = applyResultClassificationOverlay(projection, {
      participantId: 'athlete',
      classificationCode: 'DQB',
      decisionIds: ['sanction-1'],
      publicRemarks: ['DQB — serious rule violation'],
    });

    expect(result).toMatchObject({
      totalScoreX10: 0,
      scoreBeforeClassificationX10: 6120,
      scoreAdjustmentX10: 6120,
      classificationCode: 'DQB',
      activeDecisionIds: ['sanction-1'],
      remarks: ['DQB — serious rule violation'],
    });
    expect(result.seriesScoresX10).toEqual(projection.seriesScoresX10);
  });

  it('keeps the strongest classification while retaining all decision evidence', () => {
    const projection: ScoreDecisionProjection = {
      totalScoreX10: 0,
      scoreBeforeClassificationX10: 6000,
      seriesScoresX10: [6000],
      shotsX10: [100],
      deductionTotalX10: 0,
      annulledScoreX10: 0,
      scoreAdjustmentX10: 6000,
      classificationCode: 'AD_DSQ',
      remarks: ['Anti-doping decision'],
      activeDecisionIds: ['local-1'],
      applications: [],
      issues: [],
    };
    const result = applyResultClassificationOverlay(projection, {
      participantId: 'athlete',
      classificationCode: 'DSQ',
      decisionIds: ['sanction-2'],
      publicRemarks: ['Event DSQ'],
    });
    expect(result.classificationCode).toBe('AD_DSQ');
    expect(result.scoreAdjustmentX10).toBe(6000);
    expect(result.activeDecisionIds).toEqual(['local-1', 'sanction-2']);
  });
});
