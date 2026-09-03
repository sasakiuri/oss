import { GetEventByIdToken, type GetEventByIdResponse } from '@/main/modules/championship';
import { isRangeIncidentReportVoided, type IRangeIncidentReportRepository } from '@/main/modules/incident-reports';
import type { ICompetitionShotJournal } from '@/main/modules/mqtt';
import { getActiveScoringDecisions, type IScoringDecisionRepository } from '@/main/modules/scoring-decisions';
import type { QueryBus } from '@/main/shared-infra/cqrs/QueryBus';
import type { CompetitionTypeRegistry } from '@/shared/competitionTypes';
import type {
  AddIrregularShotEvidencePayload,
  AppendIrregularShotCaseEntryPayload,
  CreateIrregularShotCasePayload,
  IrregularShotCaseDto,
  ListIrregularShotCasesPayload,
} from '@/shared/ipc/contracts';

import type { IIrregularShotCaseRepository } from '../domain/IIrregularShotCaseRepository';
import { IrregularShotPublicationBlocker } from './IrregularShotPublicationBlocker';
import {
  IrregularShotCase,
  IrregularShotCaseEntry,
  IrregularShotEvidence,
  FINAL_SERIES_IRREGULAR_SHOT_KINDS,
  irregularShotCaseStatus,
  type IrregularShotCaseStatus,
} from '../domain/IrregularShotCase';

export class IrregularShotCaseService {
  private readonly publicationBlocker: IrregularShotPublicationBlocker;

  constructor(
    private readonly queryBus: QueryBus,
    private readonly repository: IIrregularShotCaseRepository,
    private readonly shots: ICompetitionShotJournal,
    private readonly incidentReports: IRangeIncidentReportRepository,
    private readonly decisions: IScoringDecisionRepository,
    private readonly competitionTypes?: CompetitionTypeRegistry,
  ) {
    this.publicationBlocker = new IrregularShotPublicationBlocker(repository, incidentReports, decisions);
  }

  async list(input: ListIrregularShotCasesPayload): Promise<IrregularShotCaseDto[]> {
    await this.requireEvent(input.eventId);
    return this.project(this.repository.findCasesByEvent(input.eventId, input.resultScope));
  }

  async create(input: CreateIrregularShotCasePayload): Promise<IrregularShotCaseDto> {
    const event = await this.requireEvent(input.eventId);
    const finalSeriesPolicy = this.resolveFinalSeriesPolicy(input, event.eventType);
    const value = IrregularShotCase.create({
      ...input,
      ...(input.ruleReference
        ? { ruleReference: input.ruleReference }
        : finalSeriesPolicy
          ? { ruleReference: finalSeriesPolicy.ruleReference }
          : {}),
      windowStartAt: new Date(input.windowStartAt),
      windowEndAt: new Date(input.windowEndAt),
      occurredAt: new Date(input.occurredAt),
    });
    this.repository.appendCase(value);
    return (await this.project([value]))[0]!;
  }

  private resolveFinalSeriesPolicy(input: CreateIrregularShotCasePayload, eventType: string) {
    if (!FINAL_SERIES_IRREGULAR_SHOT_KINDS.includes(input.kind as (typeof FINAL_SERIES_IRREGULAR_SHOT_KINDS)[number])) {
      return null;
    }
    if (input.resultScope !== 'FINAL') throw new Error('A Final-series incident requires FINAL result scope');
    if (!this.competitionTypes) throw new Error('Final-series adjudication policy registry is unavailable');
    const policy = this.competitionTypes
      .get(eventType)
      .finalSeriesAdjudication?.incidents.find((candidate) => candidate.kind === input.kind);
    if (!policy) throw new Error(`${input.kind} is not available for competition type ${eventType}`);
    return policy;
  }

  async addEvidence(input: AddIrregularShotEvidencePayload): Promise<IrregularShotCaseDto> {
    const value = this.requireEditable(input.caseId);
    const observation = this.timeline(value).find((candidate) => candidate.id === input.observationId);
    if (!observation) throw new Error('The selected shot observation is outside this case evidence window');
    const existing = this.repository.findEvidence([value.id]).get(value.id) ?? [];
    if (existing.some((item) => item.observationId === observation.id && item.relation === input.relation)) {
      throw new Error('This observation and relation are already linked');
    }
    this.repository.appendEvidence(
      IrregularShotEvidence.fromObservation({
        caseId: value.id,
        relation: input.relation,
        observation,
        ...(input.statement ? { statement: input.statement } : {}),
        officialName: input.officialName,
      }),
    );
    return (await this.project([value]))[0]!;
  }

  async appendEntry(input: AppendIrregularShotCaseEntryPayload): Promise<IrregularShotCaseDto> {
    const value = this.requireCase(input.caseId);
    const entries = this.repository.findEntries([value.id]).get(value.id) ?? [];
    const status = irregularShotCaseStatus(entries);
    assertTransition(status, input.type);
    if (input.type === 'RESOLVED') this.assertResolutionArtifacts(value, input);
    const { occurredAt, ...entryInput } = input;
    this.repository.appendEntry(
      IrregularShotCaseEntry.create({
        ...entryInput,
        ...(occurredAt ? { occurredAt: new Date(occurredAt) } : {}),
      }),
    );
    return (await this.project([value]))[0]!;
  }

  private async requireEvent(eventId: string): Promise<GetEventByIdResponse> {
    const event = (await this.queryBus.execute(GetEventByIdToken, { eventId })) as GetEventByIdResponse | null;
    if (!event) throw new Error(`Event ${eventId} not found`);
    return event;
  }

  private requireCase(id: string): IrregularShotCase {
    const value = this.repository.findCaseById(id);
    if (!value) throw new Error(`Irregular shot case ${id} not found`);
    return value;
  }

  private requireEditable(id: string): IrregularShotCase {
    const value = this.requireCase(id);
    const status = irregularShotCaseStatus(this.repository.findEntries([id]).get(id) ?? []);
    if (status === 'RESOLVED' || status === 'CLOSED' || status === 'VOID') {
      throw new Error(`A ${status.toLowerCase()} irregular shot case cannot add evidence`);
    }
    return value;
  }

  private assertResolutionArtifacts(value: IrregularShotCase, input: AppendIrregularShotCaseEntryPayload): void {
    if (!input.incidentReportId || !input.resolutionCode) {
      throw new Error('A resolution requires a resolution code and Range Incident Report');
    }
    const report = this.incidentReports.findReportById(input.incidentReportId);
    if (!report || report.eventId !== value.eventId) {
      throw new Error('The linked Range Incident Report must belong to this event');
    }
    const reportEntries = this.incidentReports.findEntriesByReportIds([report.id]).get(report.id) ?? [];
    if (isRangeIncidentReportVoided(reportEntries))
      throw new Error('A voided Range Incident Report cannot resolve a case');
    const decisionIds = [...new Set(input.scoringDecisionIds ?? [])];
    for (const id of decisionIds) {
      const decision = this.decisions.findById(id);
      if (!decision || decision.eventId !== value.eventId || decision.resultScope !== value.resultScope) {
        throw new Error(`Scoring decision ${id} must belong to this event and result scope`);
      }
      if (decision.sourceCompetitionId && decision.sourceCompetitionId !== value.competitionId) {
        throw new Error(`Scoring decision ${id} belongs to another competition`);
      }
    }
    const activeIds = new Set(
      getActiveScoringDecisions(this.decisions.findByEventId(value.eventId, value.resultScope)).map(
        (decision) => decision.id,
      ),
    );
    if (decisionIds.some((id) => !activeIds.has(id)))
      throw new Error('A revoked scoring decision cannot resolve a case');
  }

  private timeline(value: IrregularShotCase) {
    const laneIds = new Set([value.subjectLaneId, ...value.adjacentLaneIds]);
    return this.shots
      .findByCompetition(value.competitionId)
      .filter(
        (observation) =>
          laneIds.has(observation.laneId) &&
          observation.firedAt.getTime() >= value.windowStartAt.getTime() &&
          observation.firedAt.getTime() <= value.windowEndAt.getTime(),
      )
      .sort(
        (left, right) =>
          left.firedAt.getTime() - right.firedAt.getTime() || left.observedAt.getTime() - right.observedAt.getTime(),
      );
  }

  private async project(values: readonly IrregularShotCase[]): Promise<IrregularShotCaseDto[]> {
    const ids = values.map((value) => value.id);
    const entries = this.repository.findEntries(ids);
    const evidence = this.repository.findEvidence(ids);
    const blockedIds = new Set<string>();
    for (const key of new Set(values.map((value) => `${value.eventId}:${value.resultScope}`))) {
      const separator = key.lastIndexOf(':');
      const eventId = key.slice(0, separator);
      const resultScope = key.slice(separator + 1) as IrregularShotCase['resultScope'];
      for (const caseId of this.publicationBlocker.getCaseIssues(eventId, resultScope).keys()) blockedIds.add(caseId);
    }
    return values.map((value) => {
      const caseEntries = entries.get(value.id) ?? [];
      const status = irregularShotCaseStatus(caseEntries);
      return {
        id: value.id,
        eventId: value.eventId,
        competitionId: value.competitionId,
        resultScope: value.resultScope,
        kind: value.kind,
        subjectLaneId: value.subjectLaneId,
        adjacentLaneIds: [...value.adjacentLaneIds],
        windowStartAt: value.windowStartAt.toISOString(),
        windowEndAt: value.windowEndAt.toISOString(),
        summary: value.summary,
        ruleReference: value.ruleReference,
        openedBy: value.openedBy,
        occurredAt: value.occurredAt.toISOString(),
        createdAt: value.createdAt.toISOString(),
        status,
        publicationBlocked: blockedIds.has(value.id),
        timeline: this.timeline(value).map((observation) => ({
          observationId: observation.id,
          shotId: observation.shotId,
          laneId: observation.laneId,
          sessionId: observation.sessionId,
          stageIndex: observation.stageIndex,
          seriesIndex: observation.seriesIndex,
          shotNumberInSeries: observation.shotNumberInSeries,
          mode: observation.mode,
          effectiveScoreX10: observation.effectiveScoreX10,
          firedAt: observation.firedAt.toISOString(),
          receivedAt: observation.receivedAt.toISOString(),
          scored: observation.scored,
          isRecorded: observation.isRecorded,
          isReplay: observation.isReplay,
        })),
        evidence: (evidence.get(value.id) ?? []).map((item) => ({
          id: item.id,
          caseId: item.caseId,
          relation: item.relation,
          observationId: item.observationId,
          shotId: item.shotId,
          laneId: item.laneId,
          sessionId: item.sessionId,
          stageIndex: item.stageIndex,
          seriesIndex: item.seriesIndex,
          shotNumberInSeries: item.shotNumberInSeries,
          mode: item.mode,
          effectiveScoreX10: item.effectiveScoreX10,
          firedAt: item.firedAt.toISOString(),
          receivedAt: item.receivedAt.toISOString(),
          statement: item.statement,
          officialName: item.officialName,
          recordedAt: item.recordedAt.toISOString(),
        })),
        entries: caseEntries.map((entry) => ({
          id: entry.id,
          caseId: entry.caseId,
          type: entry.type,
          statement: entry.statement,
          officialName: entry.officialName,
          ruleReference: entry.ruleReference,
          resolutionCode: entry.resolutionCode,
          incidentReportId: entry.incidentReportId,
          scoringDecisionIds: [...entry.scoringDecisionIds],
          occurredAt: entry.occurredAt.toISOString(),
          recordedAt: entry.recordedAt.toISOString(),
        })),
      };
    });
  }
}

function assertTransition(status: IrregularShotCaseStatus, next: AppendIrregularShotCaseEntryPayload['type']): void {
  if (status === 'VOID') throw new Error('A void irregular shot case cannot be changed');
  if (next === 'REFERRED' && status !== 'OPEN') throw new Error('Only an open case can be referred');
  if (next === 'RESOLVED' && status !== 'OPEN' && status !== 'REFERRED') {
    throw new Error('Only an open or referred case can be resolved');
  }
  if (next === 'REOPENED' && status !== 'RESOLVED' && status !== 'CLOSED') {
    throw new Error('Only a resolved or closed case can be reopened');
  }
  if (next === 'CLOSED' && status !== 'RESOLVED') throw new Error('Resolve the case before closing it');
  if (next === 'VOID' && status === 'CLOSED') throw new Error('A closed case must be reopened before it can be voided');
}
