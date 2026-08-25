import type { ResultFormat } from './CompetitionTypeDefinition';

/**
 * Competition-specific result processing strategy.
 * Encapsulates shot/series padding, ranking, and stage-splitting logic.
 */
export interface CompetitionTypeStrategy {
  readonly id: string;

  /** Pads qualification shots to the required result format. */
  padShots(shotScores: number[], format: ResultFormat): number[];

  /** Pads qualification series scores to the required result format. */
  padSeries(seriesScores: number[], format: ResultFormat): number[];

  /**
   * Compares qualification results for ranking.
   * @returns Negative when a ranks higher, zero for a tie, positive when b ranks higher.
   */
  compareResults(
    a: { totalScore: number; seriesScores: readonly number[]; shots: readonly number[] },
    b: { totalScore: number; seriesScores: readonly number[]; shots: readonly number[] },
    format: ResultFormat,
  ): number;

  /** Splits final-round shots between Stage 1 and Stage 2. */
  splitFinalStages(matchShots: number[], format: ResultFormat): { stage1Shots: number[]; stage2Shots: number[] };
}
