// SPDX-License-Identifier: MIT
/**
 * Score utility functions (pure functions)
 */

import type { Discipline } from '@/shared/ipc/contracts';

const CLOCK_HOUR_DEGREES = 30;

/**
 * Display map for discipline names
 */
export const DISCIPLINE_LABELS: Record<Discipline, string> = {
  AIR_RIFLE_10M: '10m Air Rifle',
  AIR_PISTOL_10M: '10m Air Pistol',
  RIFLE_50M: '50m Rifle',
  PISTOL_25M: '25m Pistol',
  BEAM_RIFLE_10M: '10m Beam Rifle',
  BEAM_PISTOL_10M: '10m Beam Pistol',
};

/**
 * Converts X/Y coordinates to arrow direction
 * @param x X coordinate (mm, positive = right) or null for miss shot
 * @param y Y coordinate (mm, positive = up) or null for miss shot
 * @returns Arrow direction (12 directions), "•" for center, "−" for miss shot
 *
 * Coordinate system: Cartesian (x right, y up)
 * 12 o'clock direction: +Y axis (y > 0)
 * Clockwise: 3 o'clock (+X) → 6 o'clock (-Y) → 9 o'clock (-X) → 12 o'clock (+Y)
 */
export function toArrowDirection(x: number | null, y: number | null): string {
  if (x === null || y === null) {
    return '−'; // miss shot
  }

  if (x === 0 && y === 0) {
    return '•';
  }

  const angleRad = Math.atan2(x, y);
  let angleDeg = angleRad * (180 / Math.PI);

  if (angleDeg < 0) angleDeg += 360;

  const clockHour = Math.round(angleDeg / CLOCK_HOUR_DEGREES) % 12 || 12;

  const arrowMap: Record<number, string> = {
    12: '↑',
    1: '↗',
    2: '↗',
    3: '→',
    4: '↘',
    5: '↘',
    6: '↓',
    7: '↙',
    8: '↙',
    9: '←',
    10: '↖',
    11: '↖',
  };

  return arrowMap[clockHour] ?? '';
}

/**
 * Calculates series scores (per shotsPerSeries shots)
 */
export function calculateSeriesScores(
  scoringShots: readonly { score: number }[],
  shotsPerSeries: number = 10,
): number[] {
  const scores: number[] = [];
  for (let i = 0; i < scoringShots.length; i += shotsPerSeries) {
    const seriesShots = scoringShots.slice(i, i + shotsPerSeries);
    const seriesTotal = seriesShots.reduce((sum, shot) => sum + shot.score, 0);
    scores.push(seriesTotal);
  }
  return scores;
}
