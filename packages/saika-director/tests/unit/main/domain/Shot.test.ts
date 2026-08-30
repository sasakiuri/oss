import { describe, expect, it } from 'vitest';
import { Shot } from '@/main/modules/lane-control/domain/Shot';

describe('Shot', () => {
  it('distinguishes a scored zero from a no-shot miss', () => {
    const scoredZero = Shot.create(1, 0, 1);
    const miss = Shot.miss(2, 1);

    expect(scoredZero.disposition).toBe('SCORED');
    expect(scoredZero.isMiss).toBe(false);
    expect(miss.score.value).toBe(0);
    expect(miss.isMiss).toBe(true);
  });

  it('turns a manually scored miss into a scored slot', () => {
    const corrected = Shot.miss(1, 1).withScore(9.8);

    expect(corrected.score.value).toBe(9.8);
    expect(corrected.disposition).toBe('SCORED');
  });

  it('rejects a non-zero score marked as a miss', () => {
    expect(() => Shot.create(1, 9.8, 1, 'MISS')).toThrow('must have a score of zero');
  });
});
