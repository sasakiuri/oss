// SPDX-License-Identifier: MIT
import type { CompetitionTypeDefinition } from './CompetitionTypeDefinition';

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
  discipline: 'AIR_PISTOL_10M',
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
export const ALL_COMPETITION_TYPES: readonly CompetitionTypeDefinition[] = [BR60S, BP60];
