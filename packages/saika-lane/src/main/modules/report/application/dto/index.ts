// SPDX-License-Identifier: MIT
/**
 * DTO definitions for the Report Application layer
 */

import type { Discipline } from '@/shared/ipc/contracts';

/**
 * Score sheet shot DTO
 */
export interface ScoreSheetShotDto {
  /** Sequential number within the series (1-10) */
  shotNumber: number;
  /** Decimal score */
  value: number;
  /** Integer score */
  integerValue: number;
  /** Series number */
  seriesNumber: number;
  /** Impact point X coordinate (mm, null = miss shot) */
  x: number | null;
  /** Impact point Y coordinate (mm, null = miss shot) */
  y: number | null;
}

/**
 * Score sheet DTO
 */
export interface ScoreSheetDto {
  /** Session ID */
  sessionId: string;
  /** Lane number */
  laneNumber: number;
  /** Relay number (0 = not set) */
  relay: number;
  /** Player name (empty string = not set) */
  playerName: string;
  /** Affiliation (empty string = not set) */
  affiliation: string;
  /** All shots (match shots only, sequential number within series) */
  allShots: ScoreSheetShotDto[];
  /** Total score per series (decimal) */
  seriesScores: number[];
  /** Total score (decimal) */
  totalScore: number;
  /** Total score (integer) */
  totalIntegerScore: number;
  /** Discipline display name */
  disciplineName?: string;
  /** Discipline ID */
  discipline: Discipline;
}
