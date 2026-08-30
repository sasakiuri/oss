import { describe, expect, it } from 'vitest';

import {
  getAvailableSeriesShotCounts,
  getMatchSeriesShotCounts,
  getSeriesIndexForShot,
  sumScoresBySeries,
} from '@/shared/competitionTypes/ScoringSeriesLayout';
import { BR60S_FINAL } from '@/shared/competitionTypes/definitions/BR60S_FINAL';

describe('ScoringSeriesLayout', () => {
  it('derives and truncates the Final match-series layout', () => {
    const declared = getMatchSeriesShotCounts(BR60S_FINAL);

    expect(declared).toEqual([5, 5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
    expect(getAvailableSeriesShotCounts(declared, 11)).toEqual([5, 5, 1]);
    expect(getSeriesIndexForShot(declared, 10)).toBe(2);
    expect(getSeriesIndexForShot(declared, 23)).toBe(15);
    expect(getSeriesIndexForShot(declared, 24)).toBeNull();
    expect(sumScoresBySeries([10, 10, 10, 10, 10, 9], [5, 1])).toEqual([50, 9]);
  });
});
