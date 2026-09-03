// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import {
  getDefaultTargetScoringProfile,
  getScoringGaugeProfile,
  getTargetScoringProfile,
  SCORING_GAUGE_PROFILES,
  TARGET_SCORING_PROFILES,
} from '@/shared/target';

describe('TargetScoringProfile registry', () => {
  it('keeps ISSF authority metadata with each rules-derived profile', () => {
    const profile = getTargetScoringProfile('ISSF_AIR_PISTOL_10M_2026');

    expect(profile.authority.organization).toBe('ISSF');
    expect(profile.authority.ruleRefs).toContain('6.3.4.6');
    expect(profile.innerTenRule).toEqual({ type: 'FIXED_CENTER_RADIUS', radiusMm: 4.75 });
  });

  it('keeps beam-pistol inner-ten rules independent from ISSF air pistol', () => {
    expect(getDefaultTargetScoringProfile('BEAM_PISTOL_10M').innerTenRule).toEqual({
      type: 'FIXED_CENTER_RADIUS',
      radiusMm: 5,
    });
    expect(getDefaultTargetScoringProfile('AIR_PISTOL_10M').innerTenRule).toEqual({
      type: 'FIXED_CENTER_RADIUS',
      radiusMm: 4.75,
    });
  });

  it('exposes distinct precision and rapid-fire 25m target faces', () => {
    const precision = getTargetScoringProfile('ISSF_PISTOL_25M_PRECISION_2026');
    const rapid = getTargetScoringProfile('ISSF_PISTOL_25M_RAPID_FIRE_2026');

    expect(precision.ringLines.map((ring) => ring.radiusMm)).toEqual([25, 50, 75, 100, 125, 150, 175, 200, 225, 250]);
    expect(rapid.ringLines.map((ring) => ring.radiusMm)).toEqual([50, 90, 130, 170, 210, 250]);
  });

  it('keeps the decimal Finals source face independent from qualification scoring', () => {
    const qualification = getTargetScoringProfile('ISSF_PISTOL_25M_RAPID_FIRE_2026');
    const finalSource = getTargetScoringProfile('ISSF_PISTOL_25M_RAPID_FIRE_DECIMAL_2026');

    expect(qualification.granularity).toBe('INTEGER');
    expect(finalSource.granularity).toBe('DECIMAL');
    expect(finalSource.ringLines).toEqual(qualification.ringLines);
    expect(finalSource.authority.ruleRefs).toEqual(expect.arrayContaining(['6.17.4(d)', '6.17.5(c)']));
  });

  it('is deeply immutable at the profile boundary', () => {
    const profile = TARGET_SCORING_PROFILES.ISSF_RIFLE_50M_2026;

    expect(Object.isFrozen(profile)).toBe(true);
    expect(Object.isFrozen(profile.ringLines)).toBe(true);
    expect(Object.isFrozen(profile.authority.ruleRefs)).toBe(true);
    expect(Object.isFrozen(profile.innerTenRule)).toBe(true);
  });

  it('keeps scoring gauges independent from reusable 25m target faces', () => {
    const target = getTargetScoringProfile('ISSF_PISTOL_25M_PRECISION_2026');
    const smallbore = getScoringGaugeProfile('ISSF_SMALLBORE_5_60_2026');
    const centreFire = getScoringGaugeProfile('ISSF_CENTER_FIRE_9_65_2026');

    expect(target.defaultScoringGaugeProfileId).toBe(smallbore.id);
    expect(target.innerTenRule).toEqual({ type: 'SCORING_GAUGE_TOUCHES_RING', ringRadiusMm: 12.5 });
    expect(smallbore.diameterMm).toBe(5.6);
    expect(centreFire.diameterMm).toBe(9.65);
    expect(centreFire.authority.ruleRefs).toContain('Paper Target Scoring 1.4.1');
    expect(Object.isFrozen(SCORING_GAUGE_PROFILES.ISSF_CENTER_FIRE_9_65_2026.authority.ruleRefs)).toBe(true);
  });
});
