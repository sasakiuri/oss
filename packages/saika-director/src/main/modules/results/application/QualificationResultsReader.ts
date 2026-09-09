import { createHash } from 'node:crypto';

import { GetEventByIdToken, type GetEventByIdResponse } from '@/main/modules/championship';
import {
  ScoringDecisionProjector,
  type IScoringDecisionRepository,
  type ScoringDecision,
} from '@/main/modules/scoring-decisions';
import type { QueryBus } from '@/main/shared-infra/cqrs/QueryBus';
import { sumScoresBySeries } from '@/shared/competitionTypes';
import type { CompetitionTypeRegistry } from '@/shared/competitionTypes';
import type { RankedResultDto } from '@/shared/ipc/contracts';

import type { IResultRepository } from '../domain/IResultRepository';
import { ProjectedQualificationResult } from '../domain/ProjectedQualificationResult';
import { QualificationRankingService } from '../domain/QualificationRankingService';
import type { Result } from '../domain/Result';

import {
  applyQualificationScoreOverlays,
  noQualificationScoreOverlays,
  type IQualificationScoreOverlaySource,
} from './QualificationScoreOverlaySource';
import {
  applyResultClassificationOverlay,
  noResultClassificationOverlays,
  type IResultClassificationOverlaySource,
  type ResultClassificationOverlay,
} from './ResultClassificationOverlaySource';
import {
  qualificationCorrectionBasis,
  noResultScoreCorrections,
  type IResultScoreCorrectionSource,
} from './ResultScoreCorrectionSource';

export interface IQualificationResultsReader {
  getByEvent(eventId: string): Promise<RankedResultDto[]>;
  getByRelay(eventId: string, relayNumber: number): Promise<RankedResultDto[]>;
}

/** Public read port for consumers that need the official qualification projection. */
export class QualificationResultsReader implements IQualificationResultsReader {
  private readonly rankingService = new QualificationRankingService();
  private readonly decisionProjector = new ScoringDecisionProjector();

  constructor(
    private readonly queryBus: QueryBus,
    private readonly results: IResultRepository,
    private readonly decisions: IScoringDecisionRepository,
    private readonly competitionTypes: CompetitionTypeRegistry,
    private readonly classificationOverlays: IResultClassificationOverlaySource = noResultClassificationOverlays,
    private readonly scoreOverlays: IQualificationScoreOverlaySource = noQualificationScoreOverlays,
    private readonly corrections: IResultScoreCorrectionSource = noResultScoreCorrections,
  ) {}

  async getByEvent(eventId: string): Promise<RankedResultDto[]> {
    return this.projectAndRank(this.results.findByEventId(eventId), eventId);
  }

  async getByRelay(eventId: string, relayNumber: number): Promise<RankedResultDto[]> {
    return this.projectAndRank(this.results.findByEventIdAndRelay(eventId, relayNumber), eventId);
  }

  private async projectAndRank(sourceResults: Result[], eventId: string): Promise<RankedResultDto[]> {
    const event = (await this.queryBus.execute(GetEventByIdToken, { eventId })) as GetEventByIdResponse | null;
    if (!event) throw new Error(`Event ${eventId} not found`);
    const definition = this.competitionTypes.get(event.eventType);
    const strategy = this.competitionTypes.getStrategyFor(definition);
    const decisionsByTarget = new Map<string, ScoringDecision[]>();
    for (const decision of this.decisions.findByEventId(eventId, 'QUALIFICATION')) {
      const key = targetKey(decision.participantId, decision.relayNumber);
      const targetDecisions = decisionsByTarget.get(key) ?? [];
      targetDecisions.push(decision);
      decisionsByTarget.set(key, targetDecisions);
    }
    const overlaysByParticipant = new Map(
      this.classificationOverlays.findByEventId(eventId).map((overlay) => [overlay.participantId, overlay]),
    );

    const histories = new Map<Result, readonly ScoringDecision[]>();
    const appliedOverlays = new Map<Result, ResultClassificationOverlay | undefined>();
    const scoreOverlayRevisions = new Map<Result, string>();
    const projectedResults = sourceResults.map((result) => {
      const history = decisionsByTarget.get(targetKey(result.participantId.value, result.relayNumber)) ?? [];
      const overlay = overlaysByParticipant.get(result.participantId.value);
      histories.set(result, history);
      appliedOverlays.set(result, overlay);
      const scoreHistory = this.scoreOverlays.forResult(result);
      scoreOverlayRevisions.set(result, scoreHistory.revision);
      const base = applyQualificationScoreOverlays(result, scoreHistory);
      const basis = qualificationCorrectionBasis(result, scoreHistory);
      const correction = this.corrections.project(basis);
      if (correction.revision) scoreOverlayRevisions.set(result, `${scoreHistory.revision}:${correction.revision}`);
      if (correction.ids.length && !correction.issues.length) {
        const correctedScores = correction.shots.map((shot) => shot.scoreX10);
        const before = sumScoresBySeries(base.shotsX10, basis.seriesShotCounts);
        const after = sumScoresBySeries(correctedScores, basis.seriesShotCounts);
        base.totalScoreX10 +=
          correctedScores.reduce((sum, score) => sum + score, 0) - base.shotsX10.reduce((sum, score) => sum + score, 0);
        base.seriesScoresX10.splice(
          0,
          base.seriesScoresX10.length,
          ...base.seriesScoresX10.map((score, index) => score + after[index]! - before[index]!),
        );
        base.shotsX10.splice(0, base.shotsX10.length, ...correctedScores);
        base.rankingShots.splice(0, base.rankingShots.length, ...correction.shots.map((shot) => shot.ranking));
      }
      base.ids.push(...correction.ids);
      base.remarks.push(...correction.remarks);
      base.issues.push(...correction.issues);
      const seriesCount = Math.max(1, result.seriesScores.length);
      const projection = applyResultClassificationOverlay(
        this.decisionProjector.project(
          {
            totalScoreX10: base.totalScoreX10,
            seriesScoresX10: base.seriesScoresX10,
            shotsX10: base.shotsX10,
            shotsPerSeries: Math.max(1, Math.ceil(result.shots.length / seriesCount)),
          },
          history,
        ),
        overlay,
      );
      return new ProjectedQualificationResult(
        result,
        {
          ...projection,
          scoreAdjustmentX10: Math.round(result.totalScore * 10) - projection.totalScoreX10,
          remarks: [...base.remarks, ...projection.remarks],
          activeDecisionIds: [...base.ids, ...projection.activeDecisionIds],
          issues: [...base.issues, ...projection.issues],
        },
        strategy,
        definition.resultFormat,
        base.rankingShots,
        base.shotsX10.map((score) => score / 10),
      );
    });

    return this.rankingService.calculateRankings(projectedResults).map((ranked) => {
      const source = ranked.result.source;
      const projection = ranked.result.projection;
      const history = histories.get(source) ?? [];
      const overlay = appliedOverlays.get(source);
      const evidence = ranked.result.rankingShots.slice(0, definition.resultFormat.totalShots);
      const evidenceIssues = [...ranked.issues, ...buildEvidenceIssues(evidence)];
      if (source.seriesScores.length !== definition.resultFormat.totalSeries) {
        evidenceIssues.push(
          `Stored result has ${source.seriesScores.length} series; the Rule Pack requires ${definition.resultFormat.totalSeries}. Reconcile the original Lane result before official approval`,
        );
      }
      if (source.shots.length !== definition.resultFormat.totalShots) {
        evidenceIssues.push(
          `Stored result has ${source.shots.length} shot slots; the Rule Pack requires ${definition.resultFormat.totalShots}`,
        );
      }
      const dtoWithoutRevision = {
        id: source.id.value,
        participantId: source.participantId.value,
        rank: projection.classificationCode === null ? ranked.rank : 0,
        playerName: source.playerName,
        familyName: source.familyName,
        affiliation: source.affiliation,
        relayNumber: source.relayNumber,
        seriesScores: [...ranked.result.seriesScores],
        shotScores: [...ranked.result.shots],
        baseTotalScore: source.totalScore,
        totalScore: ranked.result.totalScore,
        scoreAdjustment: projection.scoreAdjustmentX10 / 10,
        deductionTotal: projection.deductionTotalX10 / 10,
        remarks: [...projection.remarks],
        classificationCode: projection.classificationCode,
        decisionCount: projection.activeDecisionIds.length,
        projectionIssues: [...projection.issues, ...evidenceIssues],
        evidenceSummary: {
          expectedShots: definition.resultFormat.totalShots,
          linkedShots: evidence.filter((shot) => shot.shotId !== null).length,
          independentDecimalShots: evidence.filter((shot) => shot.decimalScore !== null).length,
          innerTenClassifiedShots: evidence.filter((shot) => shot.innerTen !== null).length,
          scoreConflicts: evidence.filter((shot) => shot.scoreConflict === true).length,
        },
        confirmedAt: source.confirmedAt.toISOString(),
        status: source.status,
      } satisfies Omit<RankedResultDto, 'revision'>;

      return {
        ...dtoWithoutRevision,
        revision: calculateResultRevision(
          source,
          history,
          overlay,
          dtoWithoutRevision,
          scoreOverlayRevisions.get(source),
        ),
      };
    });
  }
}

function buildEvidenceIssues(evidence: readonly { scoreConflict?: boolean }[]): string[] {
  const conflicts = evidence.filter((shot) => shot.scoreConflict === true).length;
  return conflicts === 0
    ? []
    : [`${conflicts} shot${conflicts === 1 ? '' : 's'} have conflicting EST and independently calculated values`];
}

function targetKey(participantId: string, relayNumber: number): string {
  return `${participantId}:${relayNumber}`;
}

function calculateResultRevision(
  source: Result,
  history: readonly ScoringDecision[],
  overlay: ResultClassificationOverlay | undefined,
  projected: Omit<RankedResultDto, 'revision'>,
  scoreOverlayRevision?: string,
): string {
  const canonical = {
    source: {
      id: source.id.value,
      eventId: source.eventId.value,
      participantId: source.participantId.value,
      relayNumber: source.relayNumber,
      totalScore: source.totalScore,
      seriesScores: source.seriesScores,
      shots: source.shots,
      sourceCompetitionId: source.sourceCompetitionId,
      sourceLaneId: source.sourceLaneId,
      rankingShots: source.rankingShots,
    },
    decisions: [...history].sort(compareDecisionOrder).map((decision) => ({
      id: decision.id,
      type: decision.type,
      applicationPolicy: decision.applicationPolicy,
      pointsX10: decision.pointsX10,
      seriesIndex: decision.seriesIndex,
      shotIndex: decision.shotIndex,
      classificationCode: decision.classificationCode,
      ruleReference: decision.ruleReference,
      incidentReportNumber: decision.incidentReportNumber,
      publicRemark: decision.publicRemark,
      internalNote: decision.internalNote,
      officialName: decision.officialName,
      decidedAt: decision.decidedAt.toISOString(),
      reversesDecisionId: decision.reversesDecisionId,
    })),
    classificationOverlay: overlay ?? null,
    ...(scoreOverlayRevision ? { scoreOverlayRevision } : {}),
    projected,
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

function compareDecisionOrder(left: ScoringDecision, right: ScoringDecision): number {
  const timeDifference = left.decidedAt.getTime() - right.decidedAt.getTime();
  return timeDifference === 0 ? left.id.localeCompare(right.id) : timeDifference;
}
