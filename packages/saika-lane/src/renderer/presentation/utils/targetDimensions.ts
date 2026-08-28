// SPDX-License-Identifier: MIT
import type { Discipline } from '@/shared/ipc/contracts';
import { getDefaultTargetScoringProfile } from '@/shared/target';

/** Per-discipline default projectile radius (mm), derived from target profiles. */
export const SHOT_RADIUS_BY_DISCIPLINE: Readonly<Record<Discipline, number>> = Object.freeze({
  BEAM_RIFLE_10M: getDefaultTargetScoringProfile('BEAM_RIFLE_10M').projectileRadiusMm,
  BEAM_PISTOL_10M: getDefaultTargetScoringProfile('BEAM_PISTOL_10M').projectileRadiusMm,
  AIR_RIFLE_10M: getDefaultTargetScoringProfile('AIR_RIFLE_10M').projectileRadiusMm,
  AIR_PISTOL_10M: getDefaultTargetScoringProfile('AIR_PISTOL_10M').projectileRadiusMm,
  RIFLE_50M: getDefaultTargetScoringProfile('RIFLE_50M').projectileRadiusMm,
  PISTOL_25M: getDefaultTargetScoringProfile('PISTOL_25M').projectileRadiusMm,
});
