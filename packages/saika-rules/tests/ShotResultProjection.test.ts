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

  it('rejects invalid source score representations', () => {
    expect(() => projectShotResult(undefined, 10.2)).toThrow('sourceScoreX10 must be an integer between 0 and 109');
  });
});
