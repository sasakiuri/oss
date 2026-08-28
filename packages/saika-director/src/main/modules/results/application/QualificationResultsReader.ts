import { createHash } from 'node:crypto';

import { GetEventByIdToken, type GetEventByIdResponse } from '@/main/modules/championship';
import {
  ScoringDecisionProjector,
  type IScoringDecisionRepository,
  type ScoringDecision,
} from '@/main/modules/scoring-decisions';
import type { QueryBus } from '@/main/shared-infra/cqrs/QueryBus';
import type { CompetitionTypeRegistry } from '@/shared/competitionTypes';
import type { RankedResultDto } from '@/shared/ipc/contracts';

import type { IResultRepository } from '../domain/IResultRepository';
import { ProjectedQualificationResult } from '../domain/ProjectedQualificationResult';
import { RankingService } from '../domain/RankingService';
import type { Result } from '../domain/Result';

export interface IQualificationResultsReader {
  getByEvent(eventId: string): Promise<RankedResultDto[]>;
  getByRelay(eventId: string, relayNumber: number): Promise<RankedResultDto[]>;
}

/** Public read port for consumers that need the official qualification projection. */
export class QualificationResultsReader implements IQualificationResultsReader {
  private readonly rankingService = new RankingService();
  private readonly decisionProjector = new ScoringDecisionProjector();

  constructor(
    private readonly queryBus: QueryBus,
    private readonly results: IResultRepository,
    private readonly decisions: IScoringDecisionRepository,
    private readonly competitionTypes: CompetitionTypeRegistry,
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

    const histories = new Map<Result, readonly ScoringDecision[]>();
    const projectedResults = sourceResults.map((result) => {
      const history = decisionsByTarget.get(targetKey(result.participantId.value, result.relayNumber)) ?? [];
      histories.set(result, history);
      const seriesCount = Math.max(1, result.seriesScores.length);
      const projection = this.decisionProjector.project(
        {
          totalScoreX10: Math.round(result.totalScore * 10),
          seriesScoresX10: result.seriesScores.map((score) => Math.round(score * 10)),
          shotsX10: result.shots.map((score) => Math.round(score * 10)),
          shotsPerSeries: Math.max(1, Math.ceil(result.shots.length / seriesCount)),
        },
        history,
      );
      return new ProjectedQualificationResult(result, projection, strategy, definition.resultFormat);
    });

    return this.rankingService.calculateRankings(projectedResults).map((ranked) => {
      const source = ranked.result.source;
      const projection = ranked.result.projection;
      const history = histories.get(source) ?? [];
      const evidence = source.rankingShots.slice(0, definition.resultFormat.totalShots);
      const dtoWithoutRevision = {
        id: source.id.value,
        participantId: source.participantId.value,
        rank: projection.classificationCode === null ? ranked.rank : 0,
        playerName: source.playerName,
        familyName: source.familyName,
        affiliation: source.affiliation,
        relayNumber: source.relayNumber,
        seriesScores: [...ranked.result.seriesScores],
        baseTotalScore: source.totalScore,
        totalScore: ranked.result.totalScore,
        scoreAdjustment: projection.scoreAdjustmentX10 / 10,
        deductionTotal: projection.deductionTotalX10 / 10,
        remarks: [...projection.remarks],
        classificationCode: projection.classificationCode,
        decisionCount: projection.activeDecisionIds.length,
        projectionIssues: [...projection.issues],
        evidenceSummary: {
          expectedShots: definition.resultFormat.totalShots,
          linkedShots: evidence.filter((shot) => shot.shotId !== null).length,
          independentDecimalShots: evidence.filter((shot) => shot.decimalScore !== null).length,
          innerTenClassifiedShots: evidence.filter((shot) => shot.innerTen !== null).length,
        },
        confirmedAt: source.confirmedAt.toISOString(),
        status: source.status,
      } satisfies Omit<RankedResultDto, 'revision'>;

      return {
        ...dtoWithoutRevision,
        revision: calculateResultRevision(source, history, dtoWithoutRevision),
      };
    });
  }
}

function targetKey(participantId: string, relayNumber: number): string {
  return `${participantId}:${relayNumber}`;
}

function calculateResultRevision(
  source: Result,
  history: readonly ScoringDecision[],
  projected: Omit<RankedResultDto, 'revision'>,
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
    projected,
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

function compareDecisionOrder(left: ScoringDecision, right: ScoringDecision): number {
  const timeDifference = left.decidedAt.getTime() - right.decidedAt.getTime();
  return timeDifference === 0 ? left.id.localeCompare(right.id) : timeDifference;
}
