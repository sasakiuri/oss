import { ISSF_2026_10M_RULE_PACKS } from './air10m';
import { ISSF_2026_10M_MIXED_RULE_PACKS } from './mixed10m';
import { ISSF_2026_25M_PISTOL_RULE_PACKS } from './pistol25m';
import { ISSF_2026_50M_PISTOL_RULE_PACKS } from './pistol50m';
import { ISSF_2026_300M_RIFLE_RULE_PACKS } from './rifle300m';
import { ISSF_2026_50M_RIFLE_RULE_PACKS } from './rifle50m';

/** Applications choose their adapters and operational policies around the same event catalogue. */
export const ISSF_2026_RULE_PACKS = Object.freeze([
  ...ISSF_2026_10M_RULE_PACKS,
  ...ISSF_2026_10M_MIXED_RULE_PACKS,
  ...ISSF_2026_50M_RIFLE_RULE_PACKS,
  ...ISSF_2026_25M_PISTOL_RULE_PACKS,
  ...ISSF_2026_300M_RIFLE_RULE_PACKS,
  ...ISSF_2026_50M_PISTOL_RULE_PACKS,
]);
