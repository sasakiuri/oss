import type { RuleSeries } from '../RulePack';

import { outdoorElimination, outdoorQualification } from './outdoorQualification';

const threePositions: readonly RuleSeries[] = [
  { shots: 10, label: 'Kneeling 1', position: 'KNEELING' },
  { shots: 10, label: 'Kneeling 2', position: 'KNEELING' },
  { shots: 10, label: 'Prone 1', position: 'PRONE', targetModeControl: 'ATHLETE' },
  { shots: 10, label: 'Prone 2', position: 'PRONE' },
  { shots: 10, label: 'Standing 1', position: 'STANDING', targetModeControl: 'ATHLETE' },
  { shots: 10, label: 'Standing 2', position: 'STANDING' },
];
const target = {
  discipline: 'RIFLE_300M',
  scoringProfileId: 'ISSF_RIFLE_300M_2026',
  scoringGaugeProfileId: 'ISSF_RIFLE_8_00_2026',
} as const;

export const ISSF_2026_R300_3P60 = outdoorQualification({
  ...target,
  eventCode: 'R300_3P60',
  displayName: '300m Rifle 3 Positions 60 shots (EST)',
  matchSeconds: 6300,
  series: threePositions,
  ruleReferences: ['6.3.4.1', '7.7.1-4'],
});
export const ISSF_2026_R300_PR60 = outdoorQualification({
  ...target,
  eventCode: 'R300_PR60',
  displayName: '300m Rifle Prone 60 shots (EST)',
  matchSeconds: 3600,
  series: Array.from({ length: 6 }, (_, index) => ({ shots: 10, label: `Prone ${index + 1}`, position: 'PRONE' })),
  ruleReferences: ['6.3.4.1', '6.11.9.4', '7.7.4'],
});
export const ISSF_2026_R300_STD60 = outdoorQualification({
  ...target,
  eventCode: 'R300_STD60',
  displayName: '300m Standard Rifle 3 Positions 60 shots (EST)',
  matchSeconds: 6300,
  series: threePositions,
  ruleReferences: ['6.3.4.1', '6.11.9.5', '7.7.1-4'],
});

export const ISSF_2026_R300_3P60_ELIMINATION = outdoorElimination(ISSF_2026_R300_3P60);
// 6.11.9.4-5 inherit the corresponding 50m course, including its minimum qualifying field.
export const ISSF_2026_R300_PR60_ELIMINATION = outdoorElimination(ISSF_2026_R300_PR60, 12);
export const ISSF_2026_R300_STD60_ELIMINATION = outdoorElimination(ISSF_2026_R300_STD60, 12);

export const ISSF_2026_300M_RIFLE_RULE_PACKS = Object.freeze([
  ISSF_2026_R300_3P60,
  ISSF_2026_R300_3P60_ELIMINATION,
  ISSF_2026_R300_PR60,
  ISSF_2026_R300_PR60_ELIMINATION,
  ISSF_2026_R300_STD60,
  ISSF_2026_R300_STD60_ELIMINATION,
]);
