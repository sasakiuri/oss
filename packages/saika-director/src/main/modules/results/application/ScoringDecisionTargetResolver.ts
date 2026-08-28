import { GetEventByIdToken, type GetEventByIdResponse } from '@/main/modules/championship';
import type {
  IScoringDecisionTargetResolver,
  ScoringDecisionTargetSnapshot,
  ScoringResultScope,
} from '@/main/modules/scoring-decisions';
import type { QueryBus } from '@/main/shared-infra/cqrs/QueryBus';
import {
  getAvailableSeriesShotCounts,
  getMatchSeriesShotCounts,
  type CompetitionTypeRegistry,
} from '@/shared/competitionTypes';

import type { IFinalResultRepository } from '../domain/IFinalResultRepository';
import type { IResultRepository } from '../domain/IResultRepository';

/** Results-side adapter that keeps result model differences out of the decision ledger. */
export class ScoringDecisionTargetResolver implements IScoringDecisionTargetResolver {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly qualificationResults: IResultRepository,
    private readonly finalResults: IFinalResultRepository,
    private readonly competitionTypes: CompetitionTypeRegistry,
  ) {}

  async resolve(resultId: string, resultScope: ScoringResultScope): Promise<ScoringDecisionTargetSnapshot | null> {
    if (resultScope === 'QUALIFICATION') return this.resolveQualification(resultId);
    return this.resolveFinal(resultId);
  }

  private resolveQualification(resultId: string): ScoringDecisionTargetSnapshot | null {
    const result = this.qualificationResults.findById(resultId);
    if (!result) return null;
    const seriesCount = result.seriesScores.length;
    if (seriesCount === 0 && result.shots.length > 0) throw new Error('Qualification result has shots without series');
    const nominalSeriesSize = seriesCount > 0 ? Math.ceil(result.shots.length / seriesCount) : 0;
    const declaredCounts =
      result.shots.length === 0 ? [] : Array.from({ length: seriesCount }, () => nominalSeriesSize);

    return {
      eventId: result.eventId.value,
      participantId: result.participantId.value,
      relayNumber: result.relayNumber,
      resultScope: 'QUALIFICATION',
      resultIdAtDecision: result.id.value,
      sourceCompetitionId: result.sourceCompetitionId,
      seriesShotCounts: getAvailableSeriesShotCounts(declaredCounts, result.shots.length),
    };
  }

  private async resolveFinal(resultId: string): Promise<ScoringDecisionTargetSnapshot | null> {
    const result = this.finalResults.findById(resultId);
    if (!result) return null;
    const event = (await this.queryBus.execute(GetEventByIdToken, {
      eventId: result.eventId.value,
    })) as GetEventByIdResponse | null;
    if (!event) throw new Error(`Event ${result.eventId.value} not found`);
    const definition = this.competitionTypes.get(event.eventType);
    const seriesShotCounts = getAvailableSeriesShotCounts(
      getMatchSeriesShotCounts(definition),
      result.stage1Shots.length + result.stage2Shots.length,
    );

    return {
      eventId: result.eventId.value,
      participantId: result.participantId.value,
      relayNumber: 1,
      resultScope: 'FINAL',
      resultIdAtDecision: result.id.value,
      sourceCompetitionId: null,
      seriesShotCounts,
    };
  }
}
