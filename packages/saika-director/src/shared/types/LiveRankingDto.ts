import type { LanePhase } from '@/shared/constants';

/**
 * Live ranking data updated in real time.
 */
export interface LiveRankingDto {
  /** Rank. */
  rank: number;
  /** Lane ID. */
  laneId: string;
  /** Channel number. */
  channel: number;
  /** Athlete name. */
  playerName: string;
  /** Affiliation. */
  affiliation: string;
  /** S1–S6 subtotals. */
  seriesScores: number[];
  /** Total score. */
  totalScore: number;
  /** Average score, or zero when shotCount is zero. */
  average: number;
  /** Shot count. */
  shotCount: number;
  /** Phase. */
  phase: LanePhase;
}
