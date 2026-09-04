import { createHash } from 'node:crypto';

import { GetEventByIdToken, type GetEventByIdResponse } from '@/main/modules/championship';
import {
  getCurrentFinalPlacementReview,
  type FinalPlacementReviewEntry,
  type IFinalPlacementReviewRepository,
} from '@/main/modules/final-placement-review';
import {
  getActiveScoringDecisions,
  ScoringDecisionProjector,
  type IScoringDecisionRepository,
  type ScoreDecisionProjection,
  type ScoringDecision,
} from '@/main/modules/scoring-decisions';
import type { QueryBus } from '@/main/shared-infra/cqrs/QueryBus';
import {
  getAvailableSeriesShotCounts,
  getMatchSeriesShotCounts,
  sumScoresBySeries,
  type CompetitionTypeRegistry,
} from '@/shared/competitionTypes';
import type { FinalRankedResultDto } from '@/shared/ipc/contracts';

import type { FinalResult } from '../domain/FinalResult';
import type { IFinalResultRepository } from '../domain/IFinalResultRepository';
import {
  applyResultClassificationOverlay,
  noResultClassificationOverlays,
  type IResultClassificationOverlaySource,
  type ResultClassificationOverlay,
} from './ResultClassificationOverlaySource';

export interface IFinalResultsReader {
  getByEvent(eventId: string): Promise<FinalRankedResultDto[]>;
  getSnapshot(eventId: string): Promise<FinalResultsSnapshot>;
}

export interface FinalResultsSnapshot {
  readonly eventId: string;
  readonly scoringRevision: string;
  readonly currentPlacementReviewId: string | null;
  readonly results: readonly FinalRankedResultDto[];
}

const PLACEMENT_AFFECTING_DECISIONS = new Set(['DEDUCTION', 'ANNUL_SHOT', 'MARK_MISS', 'DISQUALIFICATION']);
const PLACEMENT_REVIEW_ISSUE = 'Final placement must be reviewed after a score or classification intervention';

/** Public Final read port. Source rank history stays immutable while decisions are projected for publication. */
export class FinalResultsReader implements IFinalResultsReader {
  private readonly projector = new ScoringDecisionProjector();

  constructor(
    private readonly queryBus: QueryBus,
    private readonly results: IFinalResultRepository,
    private readonly decisions: IScoringDecisionRepository,
    private readonly placementReviews: IFinalPlacementReviewRepository,
    private readonly competitionTypes: CompetitionTypeRegistry,
    private readonly classificationOverlays: IResultClassificationOverlaySource = noResultClassificationOverlays,
  ) {}

  async getByEvent(eventId: string): Promise<FinalRankedResultDto[]> {
    return [...(await this.getSnapshot(eventId)).results];
  }

  async getSnapshot(eventId: string): Promise<FinalResultsSnapshot> {
    const event = (await this.queryBus.execute(GetEventByIdToken, { eventId })) as GetEventByIdResponse | null;
    if (!event) throw new Error(`Event ${eventId} not found`);
    const definition = this.competitionTypes.get(event.eventType);
    const declaredSeriesShotCounts = getMatchSeriesShotCounts(definition);
    const stage1Shots = definition.resultFormat.stage1Shots ?? 0;
    ensureStageBoundary(declaredSeriesShotCounts, stage1Shots);

    const decisionsByParticipant = new Map<string, ScoringDecision[]>();
    for (const decision of this.decisions.findByEventId(eventId, 'FINAL')) {
      const history = decisionsByParticipant.get(decision.participantId) ?? [];
      history.push(decision);
      decisionsByParticipant.set(decision.participantId, history);
    }
    const overlaysByParticipant = new Map(
      this.classificationOverlays.findByEventId(eventId).map((overlay) => [overlay.participantId, overlay]),
    );

    const candidates = sortSourceResults(this.results.findByEventId(eventId)).map((result, index) =>
      this.projectResult(
        result,
        index,
        stage1Shots,
        declaredSeriesShotCounts,
        decisionsByParticipant.get(result.participantId.value) ?? [],
        overlaysByParticipant.get(result.participantId.value),
      ),
    );
    const scoringRevision = calculateSnapshotRevision(
      eventId,
      candidates.map((candidate) => candidate.dto),
    );
    const latestReview = getCurrentFinalPlacementReview(this.placementReviews.findByEventId(eventId));
    const currentReview = validateCurrentReview(latestReview, scoringRevision, candidates) ? latestReview : null;
    const reviewedRanks = new Map(
      currentReview?.placements.map((placement) => [placement.participantId, placement.rank] as const) ?? [],
    );
    const projectedResults = candidates
      .map(({ dto, placementIntervention }) => {
        const placementReviewRequired = placementIntervention && currentReview === null;
        return {
          ...dto,
          rank: dto.classificationCode === null ? (reviewedRanks.get(dto.participantId) ?? dto.sourceRank) : 0,
          projectionIssues: [...dto.projectionIssues, ...(placementReviewRequired ? [PLACEMENT_REVIEW_ISSUE] : [])],
          placementReviewId: currentReview?.id ?? null,
          placementReviewRequired,
        };
      })
      .sort(compareProjectedResults);

    return {
      eventId,
      scoringRevision,
      currentPlacementReviewId: currentReview?.id ?? null,
      results: Object.freeze(projectedResults),
    };
  }

  private projectResult(
    result: FinalResult,
    sourceIndex: number,
    stage1ShotCount: number,
    declaredSeriesShotCounts: readonly number[],
    history: readonly ScoringDecision[],
    overlay: ResultClassificationOverlay | undefined,
  ): FinalProjectionCandidate {
    const sourceShots = [...result.stage1Shots, ...result.stage2Shots];
    const shotsX10 = sourceShots.map((score) => Math.round(score * 10));
    const seriesShotCounts = getAvailableSeriesShotCounts(declaredSeriesShotCounts, sourceShots.length);
    const sourceSeriesScoresX10 = sumScoresBySeries(shotsX10, seriesShotCounts);
    const projection = applyResultClassificationOverlay(
      this.projector.project(
        {
          totalScoreX10: Math.round(result.totalScore * 10),
          seriesScoresX10: sourceSeriesScoresX10,
          shotsX10,
          seriesShotCounts,
        },
        history,
      ),
      overlay,
    );
    const stage1SeriesCount = countCompletedSeriesAtBoundary(seriesShotCounts, stage1ShotCount);
    const stage1TotalX10 = projection.seriesScoresX10
      .slice(0, stage1SeriesCount)
      .reduce((sum, score) => sum + score, 0);
    const stage2TotalX10 = projection.seriesScoresX10.slice(stage1SeriesCount).reduce((sum, score) => sum + score, 0);
    const activeDecisions = getActiveScoringDecisions(history);
    const placementIntervention =
      overlay !== undefined || activeDecisions.some((decision) => PLACEMENT_AFFECTING_DECISIONS.has(decision.type));
    const projectedShots = projection.shotsX10.map((score) => score / 10);
    const resolvedSourceRank = sourceRank(result, sourceIndex);
    const scoringRevision = calculateResultScoringRevision(
      result,
      resolvedSourceRank,
      activeDecisions,
      overlay,
      projection,
    );

    return {
      placementIntervention,
      dto: {
        id: result.id.value,
        participantId: result.participantId.value,
        sourceRank: resolvedSourceRank,
        rank: projection.classificationCode === null ? resolvedSourceRank : 0,
        playerName: result.playerName,
        affiliation: result.affiliation,
        firingPointNumber: result.firingPointNumber,
        stage1Shots: projectedShots.slice(0, stage1ShotCount),
        stage1Total: stage1TotalX10 / 10,
        stage2Shots: projectedShots.slice(stage1ShotCount),
        stage2Total: stage2TotalX10 / 10,
        seriesScores: projection.seriesScoresX10.map((score) => score / 10),
        seriesShotCounts,
        baseTotalScore: result.totalScore,
        totalScore: projection.totalScoreX10 / 10,
        scoreAdjustment: projection.scoreAdjustmentX10 / 10,
        deductionTotal: projection.deductionTotalX10 / 10,
        classificationCode: projection.classificationCode,
        decisionCount: projection.activeDecisionIds.length,
        projectionIssues: [...projection.issues],
        scoringRevision,
        placementReviewId: null,
        placementReviewRequired: placementIntervention,
        eliminatedAtShot: result.eliminatedAtShot,
        shootoffId: result.shootoffId,
        remarks: joinRemarks(result.remarks, projection.remarks),
        status: result.status,
      },
    };
  }
}

interface FinalProjectionCandidate {
  readonly dto: FinalRankedResultDto;
  readonly placementIntervention: boolean;
}

function sortSourceResults(results: FinalResult[]): FinalResult[] {
  return [...results].sort((left, right) => {
    if (left.eliminatedAtShot !== undefined && right.eliminatedAtShot !== undefined) {
      return right.eliminatedAtShot - left.eliminatedAtShot;
    }
    if (left.eliminatedAtShot !== undefined && right.eliminatedAtShot === undefined) return 1;
    if (left.eliminatedAtShot === undefined && right.eliminatedAtShot !== undefined) return -1;
    return right.totalScore - left.totalScore;
  });
}

function sourceRank(result: FinalResult, sourceIndex: number): number {
  return result.finalRank > 0 ? result.finalRank : sourceIndex + 1;
}

function ensureStageBoundary(seriesShotCounts: readonly number[], stage1Shots: number): void {
  if (stage1Shots === 0) return;
  let cumulative = 0;
  for (const count of seriesShotCounts) {
    cumulative += count;
    if (cumulative === stage1Shots) return;
    if (cumulative > stage1Shots) break;
  }
  throw new Error(`Final stage 1 boundary ${stage1Shots} does not align with a declared series`);
}

function countCompletedSeriesAtBoundary(seriesShotCounts: readonly number[], boundary: number): number {
  let cumulative = 0;
  let count = 0;
  for (const seriesShots of seriesShotCounts) {
    if (cumulative >= boundary) break;
    cumulative += seriesShots;
    count += 1;
  }
  return count;
}

function joinRemarks(sourceRemark: string, projectedRemarks: readonly string[]): string {
  return [sourceRemark.trim(), ...projectedRemarks].filter((remark) => remark.length > 0).join('; ');
}

function calculateResultScoringRevision(
  result: FinalResult,
  resolvedSourceRank: number,
  activeDecisions: readonly ScoringDecision[],
  overlay: ResultClassificationOverlay | undefined,
  projection: ScoreDecisionProjection,
): string {
  const canonical = {
    source: {
      id: result.id.value,
      eventId: result.eventId.value,
      participantId: result.participantId.value,
      playerName: result.playerName,
      affiliation: result.affiliation,
      firingPointNumber: result.firingPointNumber,
      stage1Shots: result.stage1Shots,
      stage2Shots: result.stage2Shots,
      totalScore: result.totalScore,
      finalRank: resolvedSourceRank,
      eliminatedAtShot: result.eliminatedAtShot,
      shootoffId: result.shootoffId,
      remarks: result.remarks,
      status: result.status,
    },
    placementDecisions: activeDecisions
      .filter((decision) => PLACEMENT_AFFECTING_DECISIONS.has(decision.type))
      .sort(compareDecisionOrder)
      .map((decision) => ({
        id: decision.id,
        type: decision.type,
        applicationPolicy: decision.applicationPolicy,
        pointsX10: decision.pointsX10,
        seriesIndex: decision.seriesIndex,
        shotIndex: decision.shotIndex,
        classificationCode: decision.classificationCode,
        ruleReference: decision.ruleReference,
        decidedAt: decision.decidedAt.toISOString(),
      })),
    classificationOverlay: overlay ?? null,
    projection: {
      totalScoreX10: projection.totalScoreX10,
      seriesScoresX10: projection.seriesScoresX10,
      classificationCode: projection.classificationCode,
      issues: projection.issues,
    },
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

function calculateSnapshotRevision(eventId: string, results: readonly FinalRankedResultDto[]): string {
  const canonical = {
    eventId,
    results: results.map((result) => ({
      id: result.id,
      participantId: result.participantId,
      sourceRank: result.sourceRank,
      scoringRevision: result.scoringRevision,
      classificationCode: result.classificationCode,
    })),
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

function validateCurrentReview(
  review: FinalPlacementReviewEntry | null,
  scoringRevision: string,
  candidates: readonly FinalProjectionCandidate[],
): review is FinalPlacementReviewEntry {
  if (!review || review.scoringRevision !== scoringRevision) return false;
  const rankedCandidates = candidates.filter((candidate) => candidate.dto.classificationCode === null);
  if (review.placements.length !== rankedCandidates.length) return false;
  const ranks = new Set<number>();
  const placementByParticipant = new Map(review.placements.map((placement) => [placement.participantId, placement]));
  if (placementByParticipant.size !== review.placements.length) return false;

  for (const candidate of rankedCandidates) {
    const placement = placementByParticipant.get(candidate.dto.participantId);
    if (
      !placement ||
      placement.resultId !== candidate.dto.id ||
      !Number.isInteger(placement.rank) ||
      placement.rank < 1 ||
      ranks.has(placement.rank)
    ) {
      return false;
    }
    ranks.add(placement.rank);
  }
  return true;
}

function compareProjectedResults(left: FinalRankedResultDto, right: FinalRankedResultDto): number {
  const leftClassified = left.classificationCode !== null;
  const rightClassified = right.classificationCode !== null;
  if (leftClassified !== rightClassified) return leftClassified ? 1 : -1;
  return (
    left.rank - right.rank || left.sourceRank - right.sourceRank || left.firingPointNumber - right.firingPointNumber
  );
}

function compareDecisionOrder(left: ScoringDecision, right: ScoringDecision): number {
  const timeDifference = left.decidedAt.getTime() - right.decidedAt.getTime();
  return timeDifference === 0 ? left.id.localeCompare(right.id) : timeDifference;
}
