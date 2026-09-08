import { describe, expect, it } from 'vitest';
import { getIssfFinalRecoveryGuidance } from '@/main/modules/final-recoveries/domain/IssfFinalRecoveryPolicy';

describe('Final recovery guidance', () => {
  it.each(['SIGHTING', 'OTHER'] as const)('does not offer a match malfunction allowance for %s', (phase) => {
    const guidance = getIssfFinalRecoveryGuidance('RIFLE_PISTOL_10M_50M', 'MALFUNCTION', phase);
    expect(guidance.remedies).not.toContain('REPEAT_SINGLE_SHOT');
    expect(guidance.classifications).not.toContain('ALLOWABLE_MALFUNCTION');
  });
  it('distinguishes actual repair time from the repair limit, and reserve-target sighting from a range delay', () => {
    expect(
      getIssfFinalRecoveryGuidance('RIFLE_PISTOL_10M_50M', 'MALFUNCTION', 'MATCH_SERIES').checklist.join(' '),
    ).toContain('actual repair time');
    const est = getIssfFinalRecoveryGuidance('RIFLE_PISTOL_10M_50M', 'EST_FAILURE', 'MATCH_SINGLE');
    expect(est.checklist.join(' ')).toContain('give that athlete two minutes');
    expect(est.limits.longDelayThresholdSeconds).toBe(300);
  });
});
