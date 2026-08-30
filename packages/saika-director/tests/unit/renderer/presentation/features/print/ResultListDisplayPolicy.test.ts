import { describe, expect, it } from 'vitest';

import {
  classificationSuppressesScore,
  createResultListDisplayPolicy,
  formatClassificationCode,
  formatResultScore,
} from '@/renderer/presentation/features/print/policies/ResultListDisplayPolicy';

describe('ResultListDisplayPolicy', () => {
  it('formats ring and decimal events without inferring precision from a score value', () => {
    const ring = createResultListDisplayPolicy({ scoringPrecision: 0, totalSeries: 6 });
    const decimal = createResultListDisplayPolicy({ scoringPrecision: 1, totalSeries: 6 });

    expect(formatResultScore(100, ring)).toBe('100');
    expect(formatResultScore(100, decimal)).toBe('100.0');
  });

  it('uses the official display spelling and score suppression classifications', () => {
    expect(formatClassificationCode('AD_DSQ')).toBe('AD-DSQ');
    expect(classificationSuppressesScore('AD_DSQ')).toBe(true);
    expect(classificationSuppressesScore('DNS')).toBe(true);
    expect(classificationSuppressesScore('RPO')).toBe(false);
  });
});
