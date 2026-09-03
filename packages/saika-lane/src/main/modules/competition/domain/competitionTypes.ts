// SPDX-License-Identifier: MIT
import {
  ISSF_2026_AP60,
  ISSF_2026_AP60_FINAL,
  ISSF_2026_APMIX30,
  ISSF_2026_APMIX_FINAL,
  ISSF_2026_CFP,
  ISSF_2026_AR60,
  ISSF_2026_AR60_FINAL,
  ISSF_2026_ARMIX30,
  ISSF_2026_ARMIX_FINAL,
  ISSF_2026_R3P60,
  ISSF_2026_R3P60_ELIMINATION,
  ISSF_2026_R3P60_INDOOR,
  ISSF_2026_R3P_FINAL,
  ISSF_2026_RPR60,
  ISSF_2026_RPR60_ELIMINATION,
  ISSF_2026_P25,
  ISSF_2026_P25_FINAL,
  ISSF_2026_RFPM,
  ISSF_2026_RFPM_FINAL,
  ISSF_2026_STDP,
} from '@sasakiuri/saika-rules';

import type { CompetitionTypeDefinition } from './CompetitionTypeDefinition';
import { competitionTypeFromRulePack } from './fromRulePack';

/**
 * AR60 — 10m Air Rifle 60 shots
 *
 * - Sighting stage: unlimited shots, 15-minute (900-second) stage timer
 * - Match stage: 6 series × 10 shots, 75-minute (4500-second) stage timer
 */
export const AR60: CompetitionTypeDefinition = competitionTypeFromRulePack(ISSF_2026_AR60);

/**
 * AP60 — 10m Air Pistol 60 shots
 *
 * - Sighting stage: unlimited shots, 15-minute (900-second) stage timer
 * - Match stage: 6 series × 10 shots, 75-minute (4500-second) stage timer
 */
export const AP60: CompetitionTypeDefinition = competitionTypeFromRulePack(ISSF_2026_AP60);

/** ISSF 10m Air Rifle Final — two five-shot series, then fourteen single shots. */
export const AR60_FINAL: CompetitionTypeDefinition = competitionTypeFromRulePack(ISSF_2026_AR60_FINAL);

/** ISSF 10m Air Pistol Final — two five-shot series, then fourteen single shots. */
export const AP60_FINAL: CompetitionTypeDefinition = competitionTypeFromRulePack(ISSF_2026_AP60_FINAL);

export const ARMIX30: CompetitionTypeDefinition = competitionTypeFromRulePack(ISSF_2026_ARMIX30);
export const APMIX30: CompetitionTypeDefinition = competitionTypeFromRulePack(ISSF_2026_APMIX30);
export const ARMIX_FINAL: CompetitionTypeDefinition = competitionTypeFromRulePack(ISSF_2026_ARMIX_FINAL);
export const APMIX_FINAL: CompetitionTypeDefinition = competitionTypeFromRulePack(ISSF_2026_APMIX_FINAL);
export const R3P60: CompetitionTypeDefinition = competitionTypeFromRulePack(ISSF_2026_R3P60);
export const R3P60_ELIMINATION: CompetitionTypeDefinition = competitionTypeFromRulePack(ISSF_2026_R3P60_ELIMINATION);
export const R3P60_INDOOR: CompetitionTypeDefinition = competitionTypeFromRulePack(ISSF_2026_R3P60_INDOOR);
export const RPR60: CompetitionTypeDefinition = competitionTypeFromRulePack(ISSF_2026_RPR60);
export const RPR60_ELIMINATION: CompetitionTypeDefinition = competitionTypeFromRulePack(ISSF_2026_RPR60_ELIMINATION);
export const R3P_FINAL: CompetitionTypeDefinition = competitionTypeFromRulePack(ISSF_2026_R3P_FINAL);
export const RFPM: CompetitionTypeDefinition = competitionTypeFromRulePack(ISSF_2026_RFPM);
export const P25: CompetitionTypeDefinition = competitionTypeFromRulePack(ISSF_2026_P25);
export const CFP: CompetitionTypeDefinition = competitionTypeFromRulePack(ISSF_2026_CFP);
export const STDP: CompetitionTypeDefinition = competitionTypeFromRulePack(ISSF_2026_STDP);
export const RFPM_FINAL: CompetitionTypeDefinition = competitionTypeFromRulePack(ISSF_2026_RFPM_FINAL);
export const P25_FINAL: CompetitionTypeDefinition = competitionTypeFromRulePack(ISSF_2026_P25_FINAL);

/**
 * BR60S — 10m Beam Rifle 60 shots standing
 *
 * - Sighting stage: unlimited shots, 10-minute (600-second) series timer
 * - Match stage: 6 series × 10 shots, 45-minute (2700-second) stage timer
 */
export const BR60S: CompetitionTypeDefinition = {
  id: 'BR60S',
  name: '10m Beam Rifle 60 shots standing',
  discipline: 'BEAM_RIFLE_10M',
  config: {
    name: 'Qualification',
    shotsPerSeries: 10,
    acc: 'DECIMAL',
    stages: [
      {
        name: 'Sighting',
        scored: false,
        series: [{ maxShots: 0 }],
        timer: { durationSeconds: 600 },
        requiresNewSession: false,
      },
      {
        name: 'Match',
        scored: true,
        series: [
          { maxShots: 10 },
          { maxShots: 10 },
          { maxShots: 10 },
          { maxShots: 10 },
          { maxShots: 10 },
          { maxShots: 10 },
        ],
        timer: { durationSeconds: 2700 },
        requiresNewSession: true,
      },
    ],
  },
};

/**
 * BP60 — 10m Beam Pistol 60 shots
 *
 * - Sighting stage: unlimited shots, 10-minute (600-second) series timer
 * - Match stage: 6 series × 10 shots, 45-minute (2700-second) stage timer
 */
export const BP60: CompetitionTypeDefinition = {
  id: 'BP60',
  name: '10m Beam Pistol 60 shots',
  discipline: 'BEAM_PISTOL_10M',
  config: {
    name: 'Qualification',
    shotsPerSeries: 10,
    acc: 'RING',
    stages: [
      {
        name: 'Sighting',
        scored: false,
        series: [{ maxShots: 0 }],
        timer: { durationSeconds: 600 },
        requiresNewSession: false,
      },
      {
        name: 'Match',
        scored: true,
        series: [
          { maxShots: 10 },
          { maxShots: 10 },
          { maxShots: 10 },
          { maxShots: 10 },
          { maxShots: 10 },
          { maxShots: 10 },
        ],
        timer: { durationSeconds: 2700 },
        requiresNewSession: true,
      },
    ],
  },
};

/** All defined competition types */
export const ALL_COMPETITION_TYPES: readonly CompetitionTypeDefinition[] = [
  AR60,
  AP60,
  AR60_FINAL,
  AP60_FINAL,
  ARMIX30,
  APMIX30,
  ARMIX_FINAL,
  APMIX_FINAL,
  R3P60,
  R3P60_ELIMINATION,
  R3P60_INDOOR,
  RPR60,
  RPR60_ELIMINATION,
  R3P_FINAL,
  RFPM,
  P25,
  CFP,
  STDP,
  RFPM_FINAL,
  P25_FINAL,
  BR60S,
  BP60,
];
