import type { ResultFormat } from './CompetitionTypeDefinition';

export interface RankingShotEvidence {
  /** Effective full-ring value used by Rule 6.15.1(c). */
  readonly ringScore: number;
  /** Independent EST decimal-ring value used by Rule 6.15.1(d), when available. */
  readonly decimalScore: number | null;
  /** Source of the decimal value. Official ISSF EST evidence must be device-reported. */
  readonly decimalScoreSource?: 'DEVICE' | null;
  /** Physical inner-ten determination, null when evidence is unavailable. */
  readonly innerTen: boolean | null;
  /** Inner-ten is currently derived from coordinates unless a device capability is added. */
  readonly innerTenSource?: 'CALCULATED' | null;
  /** True when the EST value and Saika's independent coordinate calculation disagree. */
  readonly scoreConflict?: boolean;
  readonly shotId: string | null;
  readonly seriesIndex: number;
}

export interface QualificationRankingInput {
  readonly totalScore: number;
  readonly seriesScores: readonly number[];
  readonly shots: readonly number[];
  readonly rankingShots?: readonly RankingShotEvidence[];
  readonly familyName?: string;
}

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
  compareResults(a: QualificationRankingInput, b: QualificationRankingInput, format: ResultFormat): number;

  /** Orders an unresolved tie for display without assigning different ranks (Rule 6.15.1(e)). */
  compareEqualResultsForDisplay?(a: QualificationRankingInput, b: QualificationRankingInput): number;

  /** Splits final-round shots between Stage 1 and Stage 2. */
  splitFinalStages(matchShots: number[], format: ResultFormat): { stage1Shots: number[]; stage2Shots: number[] };
}
