import { outdoorElimination, outdoorQualification } from './outdoorQualification';

/** 6.11.9.8 / 8.11: 90 minutes on EST; the paper-target allowance is a different course. */
export const ISSF_2026_FP60 = outdoorQualification({
  eventCode: 'FP60',
  displayName: '50m Pistol 60 shots (EST)',
  discipline: 'PISTOL_50M',
  scoringProfileId: 'ISSF_PISTOL_50M_2026',
  scoringGaugeProfileId: 'ISSF_SMALLBORE_5_60_2026',
  matchSeconds: 5400,
  series: Array.from({ length: 6 }, () => ({ shots: 10 })),
  ruleReferences: ['6.3.4.5', '6.11.9.8', '8.11'],
});

export const ISSF_2026_FP60_ELIMINATION = outdoorElimination(ISSF_2026_FP60);
export const ISSF_2026_50M_PISTOL_RULE_PACKS = Object.freeze([ISSF_2026_FP60, ISSF_2026_FP60_ELIMINATION]);
