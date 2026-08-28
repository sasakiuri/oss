// SPDX-License-Identifier: MIT
import type { Discipline } from '@/shared/ipc/contracts';
import {
  DEFAULT_TARGET_SCORING_PROFILE_BY_DISCIPLINE,
  getTargetRingRadii,
  getTargetScoringProfile,
  type TargetScoringProfileId,
} from '@/shared/target';

/**
 * Default physical scoring-ring radii for rendering, derived from the shared
 * target-profile registry so drawing and score calculation cannot drift apart.
 */
export const TARGET_RADII: Readonly<Record<Discipline, Readonly<Record<number, number>>>> = Object.freeze(
  Object.fromEntries(
    Object.entries(DEFAULT_TARGET_SCORING_PROFILE_BY_DISCIPLINE).map(([discipline, profileId]) => [
      discipline,
      getTargetRingRadii(getTargetScoringProfile(profileId)),
    ]),
  ) as Record<Discipline, Readonly<Record<number, number>>>,
);

export function getTargetRadii(discipline: Discipline): Readonly<Record<number, number>> {
  const radii = TARGET_RADII[discipline];
  if (!radii) {
    throw new Error(`Unknown discipline: ${discipline}`);
  }
  return radii;
}

export function getTargetRadiiForProfile(profileId: TargetScoringProfileId): Readonly<Record<number, number>> {
  return getTargetRingRadii(getTargetScoringProfile(profileId));
}
