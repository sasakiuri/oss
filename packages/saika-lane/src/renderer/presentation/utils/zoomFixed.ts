// SPDX-License-Identifier: MIT
/**
 * Fixed zoom calculation
 *
 * Calculates the zoom level so that the specified scoring ring fits exactly on screen.
 */

import type { Discipline } from '@/shared/ipc/contracts';

import { INITIAL_ZOOM, ZOOM_LIMITS } from './zoomConstants';
import type { ZoomMode } from './zoomModes';

/**
 * Calculate the zoom level for a fixed zoom mode
 *
 * Calculates the zoom level so that the specified scoring ring fits exactly on screen.
 * For AUTO mode, the result of calculateAutoZoom() is used instead,
 * so this function does not perform the calculation (handled by the caller).
 *
 * @param mode - Zoom mode
 * @param discipline - Discipline identifier (unused but retained for future extension)
 * @param targetRadii - Target ring radii data by score (in mm)
 * @param canvasRadius - Canvas radius (in pixels). Default is 400
 * @returns Fixed zoom level (clamped to 0.1-10.0). Returns 0 for AUTO mode
 *
 * @remarks
 * Calculation logic:
 * - `zoom = canvasRadius / (target ring radius in mm * margin coefficient) / 5`
 * - A margin coefficient of 1.1 provides 10% padding
 * - RING_8: 8-ring, RING_6: 6-ring, RING_4: 4-ring, FULL: 1-ring (entire target)
 *
 * @example
 * ```typescript
 * const radii = { 1: 45.0, 4: 30.0, 6: 20.0, 8: 10.0, 10: 0.5 };
 * const zoom = calculateFixedZoom('RING_8', 'AIR_RIFLE_10M', radii, 400);
 * console.log(zoom); // e.g.: 7.27 (800 / (10.0 * 1.1) / 5)
 * ```
 */
export function calculateFixedZoom(
  mode: ZoomMode,
  discipline: Discipline,
  targetRadii: Record<number, number>,
  canvasRadius: number = 400,
): number {
  // For AUTO mode, the caller uses calculateAutoZoom()
  if (mode === 'AUTO') {
    return 0;
  }

  // Get the scoring ring corresponding to the mode
  const ringScoreMap: Record<Exclude<ZoomMode, 'AUTO'>, number> = {
    RING_8: 8,
    RING_6: 6,
    RING_4: 4,
    FULL: 1, // 1-ring = entire target
  };

  const ringScore = ringScoreMap[mode];
  const radiusMm = targetRadii[ringScore];

  // If radius data does not exist, return the discipline-specific initial zoom
  if (radiusMm === undefined || radiusMm === null) {
    return INITIAL_ZOOM[discipline];
  }

  // Calculate zoom level
  // Formula: zoom = canvasRadius / (radius in mm * margin coefficient) / 5
  const MARGIN_COEFFICIENT = 1.1; // 10% padding
  const zoom = canvasRadius / (radiusMm * MARGIN_COEFFICIENT) / 5;

  // Clamp zoom to allowed range
  return Math.max(ZOOM_LIMITS.MIN, Math.min(ZOOM_LIMITS.MAX, zoom));
}
