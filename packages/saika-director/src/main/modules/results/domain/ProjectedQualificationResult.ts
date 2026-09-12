import type { ParticipantEntryStatus } from '@/main/modules/championship';
import type { ScoreDecisionProjection } from '@/main/modules/scoring-decisions';
import type {
  CompetitionTypeStrategy,
  QualificationRankingInput,
  RankingShotEvidence,
  ResultFormat,
} from '@/shared/competitionTypes';

import type { IRankable } from './IRankable';
import type { Result } from './Result';

/** Read model that composes immutable source results with immutable official decisions. */
export class ProjectedQualificationResult implements IRankable<ProjectedQualificationResult> {
  constructor(
    readonly source: Result,
    readonly projection: ScoreDecisionProjection,
    private readonly strategy: CompetitionTypeStrategy,
    private readonly format: ResultFormat,
    readonly entryStatus: ParticipantEntryStatus,
    private readonly sourceRankingShots: readonly RankingShotEvidence[] = source.rankingShots,
    private readonly sourceShots: readonly number[] = source.shots,
  ) {}

  get isRanked(): boolean {
    return this.entryStatus === 'COMPETING' && this.projection.classificationCode === null;
  }

  get totalScore(): number {
    return this.projection.totalScoreX10 / 10;
  }

  get seriesScores(): readonly number[] {
    return this.projection.seriesScoresX10.map((score) => score / 10);
  }

  get shots(): readonly number[] {
    return this.projection.shotsX10.map((score) => score / 10);
  }

  get rankingShots(): readonly RankingShotEvidence[] {
    return this.sourceRankingShots.map((evidence, index) => {
      const originalShot = this.sourceShots[index] ?? 0;
      const projectedShot = this.shots[index] ?? 0;
      if (projectedShot === originalShot) return evidence;
      return {
        ...evidence,
        ringScore: Math.floor(projectedShot),
        decimalScore: evidence.decimalScore === null ? null : projectedShot,
        innerTen: false,
      };
    });
  }

  compareTo(other: ProjectedQualificationResult): number {
    const thisRanked = this.isRanked;
    const otherRanked = other.isRanked;
    if (thisRanked !== otherRanked) return thisRanked ? -1 : 1;
    if (!thisRanked && !otherRanked) return 0;

    return this.strategy.compareResults(this.toRankingInput(), other.toRankingInput(), this.format);
  }

  compareEqualForDisplay(other: ProjectedQualificationResult): number {
    const left = this.toRankingInput();
    const right = other.toRankingInput();
    return (
      this.strategy.compareEqualResultsForDisplay?.(left, right) ??
      new Intl.Collator('en', { sensitivity: 'base', usage: 'sort' }).compare(
        left.familyName ?? '',
        right.familyName ?? '',
      )
    );
  }

  comparisonIssuesAgainst(other: ProjectedQualificationResult): readonly string[] {
    return this.strategy.assessComparison?.(this.toRankingInput(), other.toRankingInput(), this.format).issues ?? [];
  }

  private toRankingInput(): QualificationRankingInput {
    return {
      totalScore: this.totalScore,
      seriesScores: this.seriesScores,
      shots: this.shots,
      rankingShots: this.rankingShots,
      familyName: this.source.familyName,
    };
  }
}
