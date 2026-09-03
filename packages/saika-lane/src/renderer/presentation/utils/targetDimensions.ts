// SPDX-License-Identifier: MIT
import type { Discipline } from '@/shared/ipc/contracts';
import { getDefaultTargetScoringProfile, getScoringGaugeRadiusMm } from '@/shared/target';

/** Per-discipline fallback scoring-gauge radius (mm), derived from target profiles. */
export const SHOT_RADIUS_BY_DISCIPLINE: Readonly<Record<Discipline, number>> = Object.freeze({
  BEAM_RIFLE_10M: defaultGaugeRadius('BEAM_RIFLE_10M'),
  BEAM_PISTOL_10M: defaultGaugeRadius('BEAM_PISTOL_10M'),
  AIR_RIFLE_10M: defaultGaugeRadius('AIR_RIFLE_10M'),
  AIR_PISTOL_10M: defaultGaugeRadius('AIR_PISTOL_10M'),
  RIFLE_50M: defaultGaugeRadius('RIFLE_50M'),
  PISTOL_25M: defaultGaugeRadius('PISTOL_25M'),
});

function defaultGaugeRadius(discipline: Discipline): number {
  return getScoringGaugeRadiusMm(getDefaultTargetScoringProfile(discipline).defaultScoringGaugeProfileId);
}
