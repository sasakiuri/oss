// SPDX-License-Identifier: MIT
/**
 * Zoom-related constants
 *
 * Shared by zoomCalculator.ts and zoomFixed.ts to avoid circular dependencies.
 */

import type { Discipline } from '@/shared/ipc/contracts';

/**
 * Zoom level limits
 */
export const ZOOM_LIMITS = { MIN: 0.1, MAX: 10.0 } as const;

/**
 * Initial zoom level per discipline
 *
 * Default values based on the target size and typical shot group distribution
 * for each discipline. Used when shot data is insufficient or cannot be computed.
 */
export const INITIAL_ZOOM: Record<Discipline, number> = {
  AIR_RIFLE_10M: 3.0,
  AIR_PISTOL_10M: 3.0,
  RIFLE_50M: 2.0,
  PISTOL_25M: 1.5,
  BEAM_RIFLE_10M: 5.0,
  BEAM_PISTOL_10M: 3.0,
} as const;
