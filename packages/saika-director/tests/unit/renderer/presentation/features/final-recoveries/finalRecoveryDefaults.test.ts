import { describe, expect, it } from 'vitest';

import { getFinalRecoveryDefaults } from '@/renderer/presentation/features/final-recoveries/finalRecoveryDefaults';

describe('Final recovery defaults', () => {
  it('derives both 25m Final procedures from Rule Pack recovery capabilities', () => {
    expect(getFinalRecoveryDefaults('RFPM_FINAL', 'MATCH')).toEqual({
      procedureProfile: 'PISTOL_25M_RAPID_FIRE',
      phase: 'MATCH_SERIES',
    });
    expect(getFinalRecoveryDefaults('P25_FINAL', 'MATCH')).toEqual({
      procedureProfile: 'PISTOL_25M_WOMEN',
      phase: 'MATCH_SERIES',
    });
  });

  it('keeps non-timed and Mixed Team defaults independent of competition IDs', () => {
    expect(getFinalRecoveryDefaults('ARMIX_FINAL', 'MATCH', { shotsPerParticipant: 1 })).toEqual({
      procedureProfile: 'RIFLE_PISTOL_10M_50M_MIXED_TEAM',
      phase: 'MATCH_SINGLE',
    });
    expect(getFinalRecoveryDefaults('AR60_FINAL', 'SIGHTING')).toEqual({
      procedureProfile: 'RIFLE_PISTOL_10M_50M',
      phase: 'SIGHTING',
    });
  });

  it('uses the current series capacity and shoot-off purpose, and leaves an unknown phase for review', () => {
    expect(getFinalRecoveryDefaults('AR60_FINAL', 'MATCH', { shotsPerParticipant: 5 }).phase).toBe('MATCH_SERIES');
    expect(getFinalRecoveryDefaults('R3P_FINAL', 'MATCH', { shotsPerParticipant: 10 }).phase).toBe('MATCH_SERIES');
    expect(getFinalRecoveryDefaults('AR60_FINAL', 'MATCH', { shotsPerParticipant: 1 }).phase).toBe('MATCH_SINGLE');
    expect(getFinalRecoveryDefaults('P25_FINAL', 'MATCH', { shotsPerParticipant: 5, purpose: 'SHOOT_OFF' }).phase).toBe(
      'SHOOT_OFF',
    );
    expect(getFinalRecoveryDefaults('AR60_FINAL', 'MATCH').phase).toBe('OTHER');
  });
});
