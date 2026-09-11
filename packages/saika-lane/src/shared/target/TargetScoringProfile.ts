// SPDX-License-Identifier: MIT

import type { Discipline } from '@/shared/ipc/schemas/common';

import type { ScoringGaugeProfileId } from './ScoringGaugeProfile';

export const TARGET_SCORING_PROFILE_IDS = [
  'JRSF_BEAM_RIFLE_10M',
  'JRSF_BEAM_PISTOL_10M',
  'ISSF_AIR_RIFLE_10M_2026',
  'ISSF_AIR_PISTOL_10M_2026',
  'ISSF_RIFLE_50M_2026',
  'ISSF_RIFLE_300M_2026',
  'ISSF_PISTOL_50M_2026',
  'ISSF_PISTOL_25M_PRECISION_2026',
  'ISSF_PISTOL_25M_RAPID_FIRE_2026',
  'ISSF_PISTOL_25M_RAPID_FIRE_DECIMAL_2026',
] as const;

export type TargetScoringProfileId = (typeof TARGET_SCORING_PROFILE_IDS)[number];

export function isTargetScoringProfileId(value: string): value is TargetScoringProfileId {
  return (TARGET_SCORING_PROFILE_IDS as readonly string[]).includes(value);
}

export type TargetScoringGranularity = 'DECIMAL' | 'INTEGER';

export interface TargetRingLine {
  /** Integer score associated with this scoring ring. */
  readonly score: number;
  /** Physical radius of the scoring ring line, before projectile-gauge correction. */
  readonly radiusMm: number;
}

export interface TargetScoringAuthority {
  readonly organization: 'ISSF' | 'JRSF';
  readonly edition: string;
  readonly ruleRefs: readonly string[];
}

export type TargetInnerTenRule =
  | {
      readonly type: 'FIXED_CENTER_RADIUS';
      readonly radiusMm: number;
    }
  | {
      readonly type: 'SCORING_GAUGE_TOUCHES_RING';
      readonly ringRadiusMm: number;
    };

/**
 * Data-only scoring profile shared by calculation and rendering.
 *
 * A profile describes a target face, not the scoring gauge selected by an
 * event. Competition rules such as gauge selection, time limits and shot
 * counts live elsewhere, so target faces can be reused without
 * coupling them to a competition aggregate.
 */
export interface TargetScoringProfile {
  readonly id: TargetScoringProfileId;
  readonly discipline: Discipline;
  readonly displayName: string;
  readonly granularity: TargetScoringGranularity;
  /** Backward-compatible gauge when no competition Rule Pack selects one. */
  readonly defaultScoringGaugeProfileId: ScoringGaugeProfileId;
  readonly ringLines: readonly TargetRingLine[];
  readonly innerTenRule: TargetInnerTenRule;
  readonly authority: TargetScoringAuthority;
}

const ISSF_2026_EDITION = '2025 Second Print 07/2026, effective 1 July 2026';

function rings(...entries: ReadonlyArray<readonly [score: number, radiusMm: number]>): readonly TargetRingLine[] {
  return Object.freeze(entries.map(([score, radiusMm]) => Object.freeze({ score, radiusMm })));
}

const pistolPrecisionRings = rings(
  [10, 25],
  [9, 50],
  [8, 75],
  [7, 100],
  [6, 125],
  [5, 150],
  [4, 175],
  [3, 200],
  [2, 225],
  [1, 250],
);

function freezeProfile(profile: TargetScoringProfile): TargetScoringProfile {
  return Object.freeze({
    ...profile,
    innerTenRule: Object.freeze({ ...profile.innerTenRule }),
    authority: Object.freeze({ ...profile.authority, ruleRefs: Object.freeze([...profile.authority.ruleRefs]) }),
  });
}

export const TARGET_SCORING_PROFILES: Readonly<Record<TargetScoringProfileId, TargetScoringProfile>> = Object.freeze({
  JRSF_BEAM_RIFLE_10M: freezeProfile({
    id: 'JRSF_BEAM_RIFLE_10M',
    discipline: 'BEAM_RIFLE_10M',
    displayName: 'JRSF 10m Beam Rifle',
    granularity: 'DECIMAL',
    defaultScoringGaugeProfileId: 'JRSF_BEAM_RIFLE_VIRTUAL_6_00',
    ringLines: rings([10, 0.5], [9, 3], [8, 5.5], [7, 8], [6, 10.5], [5, 13], [4, 15.5], [3, 18], [2, 20.5], [1, 23]),
    innerTenRule: { type: 'FIXED_CENTER_RADIUS', radiusMm: 2.25 },
    authority: { organization: 'JRSF', edition: 'Saika documented profile', ruleRefs: ['TARGET_SPEC.md'] },
  }),
  JRSF_BEAM_PISTOL_10M: freezeProfile({
    id: 'JRSF_BEAM_PISTOL_10M',
    discipline: 'BEAM_PISTOL_10M',
    displayName: 'JRSF 10m Beam Pistol',
    granularity: 'DECIMAL',
    defaultScoringGaugeProfileId: 'JRSF_BEAM_PISTOL_VIRTUAL_4_50',
    ringLines: rings(
      [10, 5.75],
      [9, 13.75],
      [8, 21.75],
      [7, 29.75],
      [6, 37.75],
      [5, 45.75],
      [4, 53.75],
      [3, 61.75],
      [2, 69.75],
      [1, 77.75],
    ),
    innerTenRule: { type: 'FIXED_CENTER_RADIUS', radiusMm: 5 },
    authority: { organization: 'JRSF', edition: 'Saika documented profile', ruleRefs: ['TARGET_SPEC.md'] },
  }),
  ISSF_AIR_RIFLE_10M_2026: freezeProfile({
    id: 'ISSF_AIR_RIFLE_10M_2026',
    discipline: 'AIR_RIFLE_10M',
    displayName: 'ISSF 10m Air Rifle (2026)',
    granularity: 'DECIMAL',
    defaultScoringGaugeProfileId: 'ISSF_AIR_4_50_2026',
    ringLines: rings(
      [10, 0.25],
      [9, 2.75],
      [8, 5.25],
      [7, 7.75],
      [6, 10.25],
      [5, 12.75],
      [4, 15.25],
      [3, 17.75],
      [2, 20.25],
      [1, 22.75],
    ),
    innerTenRule: { type: 'FIXED_CENTER_RADIUS', radiusMm: 2 },
    authority: { organization: 'ISSF', edition: ISSF_2026_EDITION, ruleRefs: ['6.3.4.3'] },
  }),
  ISSF_AIR_PISTOL_10M_2026: freezeProfile({
    id: 'ISSF_AIR_PISTOL_10M_2026',
    discipline: 'AIR_PISTOL_10M',
    displayName: 'ISSF 10m Air Pistol (2026)',
    granularity: 'DECIMAL',
    defaultScoringGaugeProfileId: 'ISSF_AIR_4_50_2026',
    ringLines: rings(
      [10, 5.75],
      [9, 13.75],
      [8, 21.75],
      [7, 29.75],
      [6, 37.75],
      [5, 45.75],
      [4, 53.75],
      [3, 61.75],
      [2, 69.75],
      [1, 77.75],
    ),
    // 18.0 mm outward gauge must remain inside the 27.5 mm 9-ring:
    // 27.5 / 2 - 18.0 / 2 = 4.75 mm.
    innerTenRule: { type: 'FIXED_CENTER_RADIUS', radiusMm: 4.75 },
    authority: {
      organization: 'ISSF',
      edition: ISSF_2026_EDITION,
      ruleRefs: ['6.3.4.6', 'Paper Target Scoring 1.4.6'],
    },
  }),
  ISSF_RIFLE_50M_2026: freezeProfile({
    id: 'ISSF_RIFLE_50M_2026',
    discipline: 'RIFLE_50M',
    displayName: 'ISSF 50m Rifle (2026)',
    granularity: 'DECIMAL',
    defaultScoringGaugeProfileId: 'ISSF_SMALLBORE_5_60_2026',
    ringLines: rings(
      [10, 5.2],
      [9, 13.2],
      [8, 21.2],
      [7, 29.2],
      [6, 37.2],
      [5, 45.2],
      [4, 53.2],
      [3, 61.2],
      [2, 69.2],
      [1, 77.2],
    ),
    innerTenRule: { type: 'SCORING_GAUGE_TOUCHES_RING', ringRadiusMm: 2.5 },
    authority: { organization: 'ISSF', edition: ISSF_2026_EDITION, ruleRefs: ['6.3.4.2', '7.7.5'] },
  }),
  ISSF_RIFLE_300M_2026: freezeProfile({
    id: 'ISSF_RIFLE_300M_2026',
    discipline: 'RIFLE_300M',
    displayName: 'ISSF 300m Rifle (2026)',
    granularity: 'DECIMAL',
    defaultScoringGaugeProfileId: 'ISSF_RIFLE_8_00_2026',
    ringLines: rings(
      [10, 50],
      [9, 100],
      [8, 150],
      [7, 200],
      [6, 250],
      [5, 300],
      [4, 350],
      [3, 400],
      [2, 450],
      [1, 500],
    ),
    innerTenRule: { type: 'SCORING_GAUGE_TOUCHES_RING', ringRadiusMm: 25 },
    authority: { organization: 'ISSF', edition: ISSF_2026_EDITION, ruleRefs: ['6.3.4.1'] },
  }),
  ISSF_PISTOL_50M_2026: freezeProfile({
    id: 'ISSF_PISTOL_50M_2026',
    discipline: 'PISTOL_50M',
    displayName: 'ISSF 50m Pistol (2026)',
    granularity: 'DECIMAL',
    defaultScoringGaugeProfileId: 'ISSF_SMALLBORE_5_60_2026',
    ringLines: pistolPrecisionRings,
    innerTenRule: { type: 'SCORING_GAUGE_TOUCHES_RING', ringRadiusMm: 12.5 },
    authority: { organization: 'ISSF', edition: ISSF_2026_EDITION, ruleRefs: ['6.3.4.5'] },
  }),
  ISSF_PISTOL_25M_PRECISION_2026: freezeProfile({
    id: 'ISSF_PISTOL_25M_PRECISION_2026',
    discipline: 'PISTOL_25M',
    displayName: 'ISSF 25m Precision / 50m Pistol Target (2026)',
    granularity: 'INTEGER',
    defaultScoringGaugeProfileId: 'ISSF_SMALLBORE_5_60_2026',
    ringLines: pistolPrecisionRings,
    innerTenRule: { type: 'SCORING_GAUGE_TOUCHES_RING', ringRadiusMm: 12.5 },
    authority: { organization: 'ISSF', edition: ISSF_2026_EDITION, ruleRefs: ['6.3.4.5'] },
  }),
  ISSF_PISTOL_25M_RAPID_FIRE_2026: freezeProfile({
    id: 'ISSF_PISTOL_25M_RAPID_FIRE_2026',
    discipline: 'PISTOL_25M',
    displayName: 'ISSF 25m Rapid-Fire Pistol Target (2026)',
    granularity: 'INTEGER',
    defaultScoringGaugeProfileId: 'ISSF_SMALLBORE_5_60_2026',
    ringLines: rings([10, 50], [9, 90], [8, 130], [7, 170], [6, 210], [5, 250]),
    innerTenRule: { type: 'SCORING_GAUGE_TOUCHES_RING', ringRadiusMm: 25 },
    authority: { organization: 'ISSF', edition: ISSF_2026_EDITION, ruleRefs: ['6.3.4.4'] },
  }),
  ISSF_PISTOL_25M_RAPID_FIRE_DECIMAL_2026: freezeProfile({
    id: 'ISSF_PISTOL_25M_RAPID_FIRE_DECIMAL_2026',
    discipline: 'PISTOL_25M',
    displayName: 'ISSF 25m Rapid-Fire Pistol Target — Decimal Finals Source (2026)',
    granularity: 'DECIMAL',
    defaultScoringGaugeProfileId: 'ISSF_SMALLBORE_5_60_2026',
    ringLines: rings([10, 50], [9, 90], [8, 130], [7, 170], [6, 210], [5, 250]),
    innerTenRule: { type: 'SCORING_GAUGE_TOUCHES_RING', ringRadiusMm: 25 },
    authority: {
      organization: 'ISSF',
      edition: ISSF_2026_EDITION,
      ruleRefs: ['6.3.4.4', '6.17.4(d)', '6.17.5(c)'],
    },
  }),
});

export const DEFAULT_TARGET_SCORING_PROFILE_BY_DISCIPLINE: Readonly<Record<Discipline, TargetScoringProfileId>> =
  Object.freeze({
    BEAM_RIFLE_10M: 'JRSF_BEAM_RIFLE_10M',
    BEAM_PISTOL_10M: 'JRSF_BEAM_PISTOL_10M',
    AIR_RIFLE_10M: 'ISSF_AIR_RIFLE_10M_2026',
    AIR_PISTOL_10M: 'ISSF_AIR_PISTOL_10M_2026',
    RIFLE_50M: 'ISSF_RIFLE_50M_2026',
    RIFLE_300M: 'ISSF_RIFLE_300M_2026',
    PISTOL_50M: 'ISSF_PISTOL_50M_2026',
    // Backward-compatible training default. Timed 25m competitions override
    // this with the precision or rapid-fire profile selected by their stage.
    PISTOL_25M: 'ISSF_PISTOL_25M_PRECISION_2026',
  });

export function getTargetScoringProfile(id: TargetScoringProfileId): TargetScoringProfile {
  return TARGET_SCORING_PROFILES[id];
}

export function getDefaultTargetScoringProfile(discipline: Discipline): TargetScoringProfile {
  return getTargetScoringProfile(DEFAULT_TARGET_SCORING_PROFILE_BY_DISCIPLINE[discipline]);
}

export function getTargetRingRadii(profile: TargetScoringProfile): Readonly<Record<number, number>> {
  return Object.freeze(Object.fromEntries(profile.ringLines.map((ring) => [ring.score, ring.radiusMm])));
}
