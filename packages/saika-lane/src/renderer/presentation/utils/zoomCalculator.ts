// SPDX-License-Identifier: MIT
/**
 * Zoom calculation utilities
 *
 * Automatically calculates the optimal zoom level from shot group distribution,
 * and determines the final zoom level by combining it with a manual offset.
 *
 * Sub-modules:
 * - zoomModes.ts: Zoom mode type definitions, constants, and mode switching functions
 * - zoomFixed.ts: Fixed zoom calculation functions
 */

import type { Discipline } from '@/shared/ipc/contracts';

// Sub-module re-exports
export { calculateFixedZoom } from './zoomFixed';
export { getNextZoomMode, getPrevZoomMode, type ZoomMode } from './zoomModes';

// Import constants for local use
import { INITIAL_ZOOM, ZOOM_LIMITS } from './zoomConstants';

/**
 * Shot coordinate interface
 */
interface Shot {
  x: number | null;
  y: number | null;
}

/**
 * Margin factor
 *
 * A coefficient to provide clearance so the shot group does not touch the canvas edge.
 * A larger value increases clearance, resulting in more zoom-out.
 */
const MARGIN_FACTOR = 1.5;

/**
 * Tight group threshold (in mm)
 *
 * If the standard deviation of the shot group is below this value,
 * the group is considered tight and maximum zoom is applied.
 */
const TIGHT_GROUP_THRESHOLD = 0.5;

/**
 * Calculate the standard deviation of a shot group
 *
 * Computes the standard deviation based on each shot's deviation from the mean point.
 * Miss shots (x/y is null) are excluded from the calculation.
 *
 * @param shots - Array of impact points (objects with x, y coordinates)
 * @returns Standard deviation (in mm). Returns 0 if fewer than 2 valid shots
 */
export function calculateStandardDeviation(shots: Shot[]): number {
  // Exclude miss shots (x/y is null)
  const validShots = shots.filter(
    (shot): shot is Shot & { x: number; y: number } => shot.x !== null && shot.y !== null,
  );

  if (validShots.length < 2) {
    return 0;
  }

  // Calculate mean coordinates
  const meanX = validShots.reduce((sum, shot) => sum + shot.x, 0) / validShots.length;
  const meanY = validShots.reduce((sum, shot) => sum + shot.y, 0) / validShots.length;

  // Calculate sum of squared distances from the mean point
  const sumOfSquaredDistances = validShots.reduce((sum, shot) => {
    const dx = shot.x - meanX;
    const dy = shot.y - meanY;
    return sum + dx * dx + dy * dy;
  }, 0);

  const variance = sumOfSquaredDistances / validShots.length;
  return Math.sqrt(variance);
}

/**
 * Calculate auto zoom level from the standard deviation of a shot group
 *
 * @param shots - Array of impact points
 * @param discipline - Discipline identifier
 * @param canvasRadius - Canvas radius (in pixels). Default is 400
 * @param targetRadii - Target ring radii data by score (in mm)
 * @returns Automatically calculated zoom level (clamped to 0.1-10.0)
 */
export function calculateAutoZoom(
  shots: Shot[],
  discipline: Discipline,
  canvasRadius: number = 400,
  targetRadii?: Record<number, number>,
): number {
  // Check the number of valid shots after excluding miss shots (x/y is null)
  const validShotCount = shots.filter((s) => s.x !== null && s.y !== null).length;

  // For 0-1 shots, use a zoom based on the 6-ring (approximately the middle of the black zone)
  if (validShotCount <= 1) {
    if (targetRadii && targetRadii[6] !== undefined) {
      const MARGIN_COEFFICIENT = 1.1;
      const radiusMm = targetRadii[6];
      const zoom = canvasRadius / (radiusMm * MARGIN_COEFFICIENT) / 5;
      return Math.max(ZOOM_LIMITS.MIN, Math.min(ZOOM_LIMITS.MAX, zoom));
    }
    return INITIAL_ZOOM[discipline];
  }

  const stdDev = calculateStandardDeviation(shots);

  if (stdDev < TIGHT_GROUP_THRESHOLD) {
    return ZOOM_LIMITS.MAX;
  }

  const zoom = canvasRadius / (stdDev * 2 * MARGIN_FACTOR) / 5;
  return Math.max(ZOOM_LIMITS.MIN, Math.min(ZOOM_LIMITS.MAX, zoom));
}

/**
 * Combine auto zoom and manual offset to calculate the effective zoom level
 *
 * @param autoZoom - Automatically calculated zoom level
 * @param manualOffset - Manual adjustment value by the user (default: 0)
 * @returns Effective zoom level (clamped to 0.1-10.0)
 */
export function calculateEffectiveZoom(autoZoom: number, manualOffset: number = 0): number {
  const effectiveZoom = autoZoom + manualOffset;
  return Math.max(ZOOM_LIMITS.MIN, Math.min(ZOOM_LIMITS.MAX, effectiveZoom));
}
