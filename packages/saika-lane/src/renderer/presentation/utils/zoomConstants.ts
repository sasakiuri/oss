// SPDX-License-Identifier: MIT
/** Shared by zoomCalculator.ts and zoomFixed.ts to avoid circular imports. */

import type { Discipline } from '@/shared/ipc/contracts';

export const ZOOM_LIMITS = { MIN: 0.1, MAX: 10.0 } as const;

/**
 * Fallback zoom when there is too little shot data to calculate a level.
 */
export const INITIAL_ZOOM: Record<Discipline, number> = {
  AIR_RIFLE_10M: 3.0,
  AIR_PISTOL_10M: 3.0,
  RIFLE_50M: 2.0,
  RIFLE_300M: 1.0,
  PISTOL_50M: 1.5,
  PISTOL_25M: 1.5,
  BEAM_RIFLE_10M: 5.0,
  BEAM_PISTOL_10M: 3.0,
} as const;
