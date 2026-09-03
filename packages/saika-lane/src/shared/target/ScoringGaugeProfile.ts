// SPDX-License-Identifier: MIT

import type { Discipline } from '@/shared/ipc/schemas/common';

export const SCORING_GAUGE_PROFILE_IDS = [
  'JRSF_BEAM_RIFLE_VIRTUAL_6_00',
  'JRSF_BEAM_PISTOL_VIRTUAL_4_50',
  'ISSF_AIR_4_50_2026',
  'ISSF_SMALLBORE_5_60_2026',
  'ISSF_CENTER_FIRE_9_65_2026',
] as const;

export type ScoringGaugeProfileId = (typeof SCORING_GAUGE_PROFILE_IDS)[number];

export function isScoringGaugeProfileId(value: string): value is ScoringGaugeProfileId {
  return (SCORING_GAUGE_PROFILE_IDS as readonly string[]).includes(value);
}

export type ScoringGaugeGeometryKind = 'VIRTUAL_PROJECTILE' | 'PROJECTILE_DIAMETER' | 'MEASURING_EDGE_DIAMETER';

export interface ScoringGaugeAuthority {
  readonly organization: 'ISSF' | 'JRSF';
  readonly edition: string;
  readonly ruleRefs: readonly string[];
}

/**
 * Geometry used by Lane's independent coordinate-to-score calculation.
 *
 * It is intentionally separate from a target face: the same 25m face is
 * scored with the 5.60 mm smallbore gauge or the 9.65 mm Centre Fire
 * measuring edge, depending on the event. An approved EST's reported score
 * remains authoritative; this profile only controls Lane's calculated
 * cross-check and its gauge-footprint rendering.
 */
export interface ScoringGaugeProfile {
  readonly id: ScoringGaugeProfileId;
  readonly displayName: string;
  readonly diameterMm: number;
  readonly geometryKind: ScoringGaugeGeometryKind;
  readonly compatibleDisciplines: readonly Discipline[];
  readonly authority: ScoringGaugeAuthority;
}

const ISSF_2026_EDITION = '2025 Second Print 07/2026, effective 1 July 2026';

function freezeProfile(profile: ScoringGaugeProfile): ScoringGaugeProfile {
  return Object.freeze({
    ...profile,
    compatibleDisciplines: Object.freeze([...profile.compatibleDisciplines]),
    authority: Object.freeze({ ...profile.authority, ruleRefs: Object.freeze([...profile.authority.ruleRefs]) }),
  });
}

export const SCORING_GAUGE_PROFILES: Readonly<Record<ScoringGaugeProfileId, ScoringGaugeProfile>> = Object.freeze({
  JRSF_BEAM_RIFLE_VIRTUAL_6_00: freezeProfile({
    id: 'JRSF_BEAM_RIFLE_VIRTUAL_6_00',
    displayName: 'JRSF Beam Rifle virtual 6.00 mm aperture',
    diameterMm: 6,
    geometryKind: 'VIRTUAL_PROJECTILE',
    compatibleDisciplines: ['BEAM_RIFLE_10M'],
    authority: { organization: 'JRSF', edition: 'Saika documented profile', ruleRefs: ['TARGET_SPEC.md'] },
  }),
  JRSF_BEAM_PISTOL_VIRTUAL_4_50: freezeProfile({
    id: 'JRSF_BEAM_PISTOL_VIRTUAL_4_50',
    displayName: 'JRSF Beam Pistol virtual 4.50 mm aperture',
    diameterMm: 4.5,
    geometryKind: 'VIRTUAL_PROJECTILE',
    compatibleDisciplines: ['BEAM_PISTOL_10M'],
    authority: { organization: 'JRSF', edition: 'Saika documented profile', ruleRefs: ['TARGET_SPEC.md'] },
  }),
  ISSF_AIR_4_50_2026: freezeProfile({
    id: 'ISSF_AIR_4_50_2026',
    displayName: 'ISSF Air 4.50 mm coordinate-scoring diameter (2026)',
    diameterMm: 4.5,
    geometryKind: 'PROJECTILE_DIAMETER',
    compatibleDisciplines: ['AIR_RIFLE_10M', 'AIR_PISTOL_10M'],
    authority: {
      organization: 'ISSF',
      edition: ISSF_2026_EDITION,
      ruleRefs: ['6.3.4.3', '6.3.4.6', '7.4.6', '8.4.4', 'Paper Target Scoring 1.4.4'],
    },
  }),
  ISSF_SMALLBORE_5_60_2026: freezeProfile({
    id: 'ISSF_SMALLBORE_5_60_2026',
    displayName: 'ISSF Smallbore 5.60 mm measuring edge (2026)',
    diameterMm: 5.6,
    geometryKind: 'MEASURING_EDGE_DIAMETER',
    compatibleDisciplines: ['RIFLE_50M', 'PISTOL_25M'],
    authority: {
      organization: 'ISSF',
      edition: ISSF_2026_EDITION,
      ruleRefs: ['7.4.6', '8.4.3.2', 'Paper Target Scoring 1.4.3', 'Paper Target Scoring 5.2.1'],
    },
  }),
  ISSF_CENTER_FIRE_9_65_2026: freezeProfile({
    id: 'ISSF_CENTER_FIRE_9_65_2026',
    displayName: 'ISSF Centre Fire 9.65 mm measuring edge (2026)',
    diameterMm: 9.65,
    geometryKind: 'MEASURING_EDGE_DIAMETER',
    compatibleDisciplines: ['PISTOL_25M'],
    authority: {
      organization: 'ISSF',
      edition: ISSF_2026_EDITION,
      ruleRefs: ['8.4.3.3', 'Paper Target Scoring 1.4.1', 'Paper Target Scoring 5.2.1'],
    },
  }),
});

export function getScoringGaugeProfile(id: ScoringGaugeProfileId): ScoringGaugeProfile {
  return SCORING_GAUGE_PROFILES[id];
}

export function getScoringGaugeRadiusMm(id: ScoringGaugeProfileId): number {
  return getScoringGaugeProfile(id).diameterMm / 2;
}
