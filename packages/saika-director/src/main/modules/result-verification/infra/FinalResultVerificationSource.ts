import { createHash } from 'node:crypto';

import { GetEventByIdToken, type GetEventByIdResponse } from '@/main/modules/championship';
import type { IFinalResultsReader } from '@/main/modules/results';
import type { IMixedTeamFinalResultRepository, MixedTeamFinalResultRecord } from '@/main/modules/team-results';
import type { QueryBus } from '@/main/shared-infra/cqrs/QueryBus';
import type { CompetitionTypeRegistry } from '@/shared/competitionTypes';
import type { FinalRankedResultDto } from '@/shared/ipc/contracts';

import type {
  IResultVerificationSource,
  ResultVerificationSourceSnapshot,
  VerifiableResult,
} from '../application/ResultVerificationSource';

/** Individual and Mixed Team Final results adapted to the common verification workflow. */
export class FinalResultVerificationSource implements IResultVerificationSource {
  readonly resultScope = 'FINAL' as const;

  constructor(
    private readonly queryBus: QueryBus,
    private readonly individualResults: IFinalResultsReader,
    private readonly mixedTeamResults: Pick<IMixedTeamFinalResultRepository, 'findByEvent'>,
    private readonly competitionTypes: CompetitionTypeRegistry,
  ) {}

  async load(eventId: string): Promise<ResultVerificationSourceSnapshot> {
    const event = (await this.queryBus.execute(GetEventByIdToken, { eventId })) as GetEventByIdResponse | null;
    if (!event) throw new Error(`Event ${eventId} not found`);
    const definition = this.competitionTypes.get(event.eventType);
    const policy = definition.resultVerification ?? { topIndividualResults: 0, topTeamResults: 0 };
    const individualSnapshot = await this.individualResults.getSnapshot(eventId);
    const mixedResults = this.mixedTeamResults.findByEvent(eventId);
    if (individualSnapshot.results.length > 0 && mixedResults.length > 0) {
      throw new Error('An event cannot publish both individual and Mixed Team Final result sets');
    }

    const isMixed = definition.teamFormat === 'MIXED_PAIR';
    const results = isMixed ? mixedResults.map(toMixedTeamResult) : individualSnapshot.results.map(toIndividualResult);
    const configuredChecks = isMixed ? policy.topTeamResults : policy.topIndividualResults;
    const issues: string[] = [];
    if (definition.config.name !== 'Final') issues.push('The event is not configured as a Final');
    if (isMixed && individualSnapshot.results.length > 0) {
      issues.push('Individual Final results are present for a Mixed Team event');
    }
    if (!isMixed && mixedResults.length > 0) {
      issues.push('Mixed Team Final results are present for an individual event');
    }

    return {
      eventId,
      resultScope: this.resultScope,
      // Mixed Team aggregates are directly checked as result-list items by this source.
      configuredIndividualChecks: configuredChecks,
      configuredTeamChecks: 0,
      teamVerificationSupported: true,
      requiredTeamChecks: 0,
      checkedTeamResults: 0,
      teamVerificationRunId: null,
      teamSnapshotRevision: null,
      sourceRevision: isMixed ? calculateMixedRevision(eventId, mixedResults) : individualSnapshot.scoringRevision,
      results,
      issues,
    };
  }
}

function toIndividualResult(result: FinalRankedResultDto): VerifiableResult {
  const shotCount = result.stage1Shots.length + result.stage2Shots.length;
  return {
    resultId: result.id,
    participantId: result.participantId,
    revision: result.scoringRevision,
    rank: result.rank,
    playerName: result.playerName,
    affiliation: result.affiliation,
    relayNumber: result.firingPointNumber,
    totalScore: result.totalScore,
    classificationCode: result.classificationCode,
    decisionCount: result.decisionCount,
    projectionIssues: result.projectionIssues,
    status: result.status === 'in_progress' ? 'published' : 'confirmed',
    evidenceSummary: emptyEvidence(shotCount),
  };
}

function toMixedTeamResult(result: MixedTeamFinalResultRecord): VerifiableResult {
  const shotCount = result.members.reduce(
    (sum, member) => sum + member.stage1Shots.length + member.stage2Shots.length,
    0,
  );
  return {
    resultId: result.id,
    participantId: `TEAM:${result.teamId}`,
    revision: calculateMixedResultRevision(result),
    rank: result.finalRank,
    playerName: result.teamName,
    affiliation: result.nationCode,
    relayNumber: Math.min(...result.members.map((member) => member.firingPointNumber)),
    totalScore: result.totalScore,
    classificationCode: null,
    decisionCount: 0,
    projectionIssues: [],
    status: 'confirmed',
    evidenceSummary: emptyEvidence(shotCount),
  };
}

function emptyEvidence(expectedShots: number) {
  return {
    expectedShots,
    linkedShots: 0,
    independentDecimalShots: 0,
    innerTenClassifiedShots: 0,
    scoreConflicts: 0,
  };
}

function calculateMixedResultRevision(result: MixedTeamFinalResultRecord): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        id: result.id,
        teamId: result.teamId,
        teamName: result.teamName,
        nationCode: result.nationCode,
        members: result.members,
        totalScore: result.totalScore,
        finalRank: result.finalRank,
        eliminatedAtShot: result.eliminatedAtShot,
        shootoffId: result.shootoffId,
        remarks: result.remarks,
      }),
    )
    .digest('hex');
}

function calculateMixedRevision(eventId: string, results: readonly MixedTeamFinalResultRecord[]): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        eventId,
        results: results.map((result) => ({ id: result.id, revision: calculateMixedResultRevision(result) })),
      }),
    )
    .digest('hex');
}
