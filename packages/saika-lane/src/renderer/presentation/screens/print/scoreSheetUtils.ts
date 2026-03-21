// SPDX-License-Identifier: MIT
import type { ScoreSheetShotDto } from '@/shared/ipc/contracts';

/**
 * Count occurrences of scores 10 through 0 in descending order (10,9,...,0)
 * @returns Array of length 11 (index 0 = 10 points, index 10 = 0 points)
 */
export function countShotValues(shots: readonly ScoreSheetShotDto[]): number[] {
  const counts: number[] = Array.from({ length: 11 }, () => 0);
  for (const shot of shots) {
    const idx = 10 - shot.integerValue;
    if (idx >= 0 && idx <= 10 && counts[idx] !== undefined) {
      counts[idx]++;
    }
  }
  return counts;
}

/**
 * Return shots for the specified series, sorted by shotNumber in ascending order
 */
export function getSeriesShots(allShots: readonly ScoreSheetShotDto[], seriesNumber: number): ScoreSheetShotDto[] {
  return allShots.filter((s) => s.seriesNumber === seriesNumber).sort((a, b) => a.shotNumber - b.shotNumber);
}

/**
 * Return the integer total score for the specified series
 */
export function getSeriesIntegerScore(allShots: readonly ScoreSheetShotDto[], seriesNumber: number): number {
  return getSeriesShots(allShots, seriesNumber).reduce((sum, shot) => sum + shot.integerValue, 0);
}

/**
 * Format the shot score to 1 decimal place. Returns '-' if undefined
 */
export function formatShotValue(shot: ScoreSheetShotDto | undefined): string {
  if (!shot) return '-';
  return (shot.value / 10).toFixed(1);
}

/**
 * Return unique series numbers from allShots in ascending order
 */
export function extractSeriesNumbers(shots: readonly ScoreSheetShotDto[]): number[] {
  return [...new Set(shots.map((s) => s.seriesNumber))].sort((a, b) => a - b);
}
