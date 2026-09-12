import { GetEventByIdToken, type GetEventByIdResponse } from '@/main/modules/championship';
import type { IQualificationResultsReader } from '@/main/modules/results';
import type { QueryBus } from '@/main/shared-infra/cqrs/QueryBus';
import type { CompetitionTypeRegistry } from '@/shared/competitionTypes';

import {
  UnsupportedTeamResultVerificationReadiness,
  type ITeamResultVerificationReadiness,
  type TeamResultVerificationKind,
} from '../application/ITeamResultVerificationReadiness';
import type {
  IResultVerificationSource,
  ResultVerificationSourceSnapshot,
} from '../application/ResultVerificationSource';

/** Qualification projection, team-memory checks and event policy adapter. */
export class QualificationResultVerificationSource implements IResultVerificationSource {
  readonly resultScope = 'QUALIFICATION' as const;

  constructor(
    private readonly queryBus: QueryBus,
    private readonly results: IQualificationResultsReader,
    private readonly competitionTypes: CompetitionTypeRegistry,
    private readonly teamVerification: ITeamResultVerificationReadiness = new UnsupportedTeamResultVerificationReadiness(),
  ) {}

  async load(eventId: string): Promise<ResultVerificationSourceSnapshot> {
    const event = (await this.queryBus.execute(GetEventByIdToken, { eventId })) as GetEventByIdResponse | null;
    if (!event) throw new Error(`Event ${eventId} not found`);
    const definition = this.competitionTypes.get(event.eventType);
    const policy = definition.resultVerification ?? { topIndividualResults: 0, topTeamResults: 0 };
    const results = await this.results.getByEvent(eventId);
    const teamResultKind: TeamResultVerificationKind = definition.teamFormat === 'MIXED_PAIR' ? 'MIXED_TEAM' : 'TEAM';
    const teamReadiness = await this.teamVerification.assess({
      eventId,
      resultKind: teamResultKind,
      configuredChecks: policy.topTeamResults,
      requireResults: definition.teamFormat === 'MIXED_PAIR' && policy.topTeamResults > 0,
    });

    return {
      eventId,
      resultScope: this.resultScope,
      configuredIndividualChecks: policy.topIndividualResults,
      configuredTeamChecks: policy.topTeamResults,
      teamVerificationSupported: teamReadiness.supported,
      requiredTeamChecks: teamReadiness.requiredChecks,
      checkedTeamResults: teamReadiness.checkedResults,
      teamVerificationRunId: teamReadiness.currentVerificationId,
      teamSnapshotRevision: teamReadiness.snapshotRevision,
      sourceRevision: null,
      results: results.map((result) => ({
        resultId: result.id,
        participantId: result.participantId,
        revision: result.revision,
        rank: result.rank,
        entryStatus: result.entryStatus,
        playerName: result.playerName,
        affiliation: result.affiliation,
        relayNumber: result.relayNumber,
        totalScore: result.totalScore,
        classificationCode: result.classificationCode,
        decisionCount: result.decisionCount,
        projectionIssues: result.projectionIssues,
        status: result.status,
        evidenceSummary: result.evidenceSummary,
      })),
      issues: [
        ...teamReadiness.issues,
        ...results.flatMap((result) => result.projectionIssues.map((issue) => `${result.playerName}: ${issue}`)),
      ],
    };
  }
}
