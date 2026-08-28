// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { getDefaultTargetScoringProfile, getTargetScoringProfile, TARGET_SCORING_PROFILES } from '@/shared/target';

describe('TargetScoringProfile registry', () => {
  it('keeps ISSF authority metadata with each rules-derived profile', () => {
    const profile = getTargetScoringProfile('ISSF_AIR_PISTOL_10M_2026');

    expect(profile.authority.organization).toBe('ISSF');
    expect(profile.authority.ruleRefs).toContain('6.3.4.6');
    expect(profile.innerTenCenterRadiusMm).toBe(4.75);
  });

  it('keeps beam-pistol inner-ten rules independent from ISSF air pistol', () => {
    expect(getDefaultTargetScoringProfile('BEAM_PISTOL_10M').innerTenCenterRadiusMm).toBe(5);
    expect(getDefaultTargetScoringProfile('AIR_PISTOL_10M').innerTenCenterRadiusMm).toBe(4.75);
  });

  it('exposes distinct precision and rapid-fire 25m target faces', () => {
    const precision = getTargetScoringProfile('ISSF_PISTOL_25M_PRECISION_2026');
    const rapid = getTargetScoringProfile('ISSF_PISTOL_25M_RAPID_FIRE_2026');

    expect(precision.ringLines.map((ring) => ring.radiusMm)).toEqual([25, 50, 75, 100, 125, 150, 175, 200, 225, 250]);
    expect(rapid.ringLines.map((ring) => ring.radiusMm)).toEqual([50, 90, 130, 170, 210, 250]);
  });

  it('is deeply immutable at the profile boundary', () => {
    const profile = TARGET_SCORING_PROFILES.ISSF_RIFLE_50M_2026;

    expect(Object.isFrozen(profile)).toBe(true);
    expect(Object.isFrozen(profile.ringLines)).toBe(true);
    expect(Object.isFrozen(profile.authority.ruleRefs)).toBe(true);
  });
});
