import { describe, expect, it } from 'vitest';

import { ISSF_2026_P25_FINAL, ISSF_2026_RFPM_FINAL, projectShotResult } from '../src';

describe('projectShotResult', () => {
  it('keeps ordinary score results unchanged', () => {
    expect(projectShotResult(undefined, 103)).toEqual({
      sourceScoreX10: 103,
      resultScoreX10: 103,
      classification: 'SCORE',
    });
  });

  it('uses the inclusive 9.7 Rapid Fire Men hit boundary without discarding the source score', () => {
    const projection = ISSF_2026_RFPM_FINAL.capabilities.resultProjection;
    expect(projectShotResult(projection, 96)).toEqual({
      sourceScoreX10: 96,
      resultScoreX10: 0,
      classification: 'MISS',
    });
    expect(projectShotResult(projection, 97)).toEqual({
      sourceScoreX10: 97,
      resultScoreX10: 10,
      classification: 'HIT',
    });
  });

  it('uses the inclusive 10.2 Pistol Women hit boundary', () => {
    const projection = ISSF_2026_P25_FINAL.capabilities.resultProjection;
    expect(projectShotResult(projection, 101).classification).toBe('MISS');
    expect(projectShotResult(projection, 102).classification).toBe('HIT');
  });

  it.each([0, 109])('accepts the inclusive source score boundary %i', (score) => {
    expect(projectShotResult(undefined, score)).toEqual({
      sourceScoreX10: score,
      resultScoreX10: score,
      classification: 'SCORE',
    });
  });

  it.each([-1, 110, 10.2, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects invalid source score %s before applying a projection',
    (score) => {
      for (const projection of [undefined, ISSF_2026_RFPM_FINAL.capabilities.resultProjection]) {
        expect(() => projectShotResult(projection, score)).toThrow(
          'sourceScoreX10 must be an integer between 0 and 109',
        );
      }
    },
  );
});
