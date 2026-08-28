import { GetEventByIdToken, type GetEventByIdResponse } from '@/main/modules/championship';
import {
  getActiveScoringDecisions,
  type IScoringDecisionRepository,
  type ScoringDecision,
} from '@/main/modules/scoring-decisions';
import type { QueryBus } from '@/main/shared-infra/cqrs/QueryBus';
import type {
  AppendIncidentReportEntryPayload,
  CreateRangeIncidentReportPayload,
  IncidentReportEntryDto,
  IncidentReportEventStatusDto,
  IncidentReportLinkedDecisionDto,
  RangeIncidentReportDto,
  UncoveredIncidentDecisionDto,
} from '@/shared/ipc/contracts';

import type { IRangeIncidentReportRepository } from '../domain/IRangeIncidentReportRepository';
import { RangeIncidentReport } from '../domain/RangeIncidentReport';
import {
  INCIDENT_REPORT_OFFICIAL_ROLES,
  RangeIncidentReportEntry,
  isRangeIncidentReportVoided,
  type IncidentReportOfficialRole,
} from '../domain/RangeIncidentReportEntry';

const REQUIRED_SIGNATURE_ROLES: readonly IncidentReportOfficialRole[] = INCIDENT_REPORT_OFFICIAL_ROLES.filter(
  (role) => role !== 'OTHER_OFFICIAL',
);

const REPORT_REQUIRED_DECISION_TYPES = new Set([
  'DEDUCTION',
  'ANNUL_SHOT',
  'MARK_MISS',
  'WARNING',
  'DISQUALIFICATION',
  'MALFUNCTION',
  'EXTRA_TIME',
  'REPEAT_SHOT',
  'REPEAT_SERIES',
]);

/** Coordinates the independent Form IR ledger and optional scoring-decision references. */
export class IncidentReportService {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly repository: IRangeIncidentReportRepository,
    private readonly decisions: IScoringDecisionRepository,
  ) {}

  async listByEvent(eventId: string): Promise<IncidentReportEventStatusDto> {
    const event = await this.findEvent(eventId);
    if (!event) throw new Error(`Event ${eventId} not found`);
    return this.buildEventStatus(eventId, this.repository.findReportsByEvent(eventId));
  }

  async getById(reportId: string): Promise<RangeIncidentReportDto> {
    const report = this.repository.findReportById(reportId);
    if (!report) throw new Error(`Range Incident Report ${reportId} not found`);
    const entries = this.repository.findEntriesByReportIds([report.id]).get(report.id) ?? [];
    const history = this.findDecisionHistory(report.eventId);
    return toReportDto(report, entries, history);
  }

  async create(input: CreateRangeIncidentReportPayload): Promise<RangeIncidentReportDto> {
    const event = await this.findEvent(input.eventId);
    if (!event) throw new Error(`Event ${input.eventId} not found`);
    if (this.repository.findReportBySerial(input.eventId, input.serialNumber)) {
      throw new Error(`Range Incident Report ${input.serialNumber} already exists for this event`);
    }

    const report = RangeIncidentReport.create({
      ...input,
      eventName: event.name,
      occurredAt: new Date(input.occurredAt),
    });
    this.repository.appendReport(report);
    return toReportDto(report, [], this.findDecisionHistory(input.eventId));
  }

  async appendEntry(input: AppendIncidentReportEntryPayload): Promise<IncidentReportEntryDto> {
    const report = this.repository.findReportById(input.reportId);
    if (!report) throw new Error(`Range Incident Report ${input.reportId} not found`);
    const entries = this.repository.findEntriesByReportIds([report.id]).get(report.id) ?? [];
    if (isRangeIncidentReportVoided(entries)) throw new Error('A voided Range Incident Report cannot be changed');

    const base = { reportId: report.id, officialName: input.officialName };
    let entry: RangeIncidentReportEntry;
    switch (input.type) {
      case 'SIGNATURE':
        entry = RangeIncidentReportEntry.createSignature({
          ...base,
          officialRole: input.officialRole,
          statement: input.statement ?? 'Reviewed and signed',
        });
        break;
      case 'FORWARDED':
        entry = RangeIncidentReportEntry.createForwarding({
          ...base,
          destination: input.destination,
          statement: input.statement ?? 'Copy forwarded',
        });
        break;
      case 'NOTE':
        entry = RangeIncidentReportEntry.createNote({ ...base, statement: input.statement });
        break;
      case 'VOID':
        entry = RangeIncidentReportEntry.createVoid({ ...base, statement: input.statement });
        break;
    }
    this.repository.appendEntry(entry);
    return toEntryDto(entry);
  }

  private async findEvent(eventId: string): Promise<GetEventByIdResponse | null> {
    return (await this.queryBus.execute(GetEventByIdToken, { eventId })) as GetEventByIdResponse | null;
  }

  private buildEventStatus(eventId: string, reports: readonly RangeIncidentReport[]): IncidentReportEventStatusDto {
    const entriesByReport = this.repository.findEntriesByReportIds(reports.map((report) => report.id));
    const history = this.findDecisionHistory(eventId);
    const active = getActiveScoringDecisions(history).filter((decision) =>
      REPORT_REQUIRED_DECISION_TYPES.has(decision.type),
    );
    const reportBySerial = new Map(
      reports.map((report) => [
        normalizeSerial(report.serialNumber),
        { report, entries: entriesByReport.get(report.id) ?? [] },
      ]),
    );
    const uncoveredDecisions: UncoveredIncidentDecisionDto[] = [];
    for (const decision of active) {
      const reference = decision.incidentReportNumber;
      const linked = reference ? reportBySerial.get(normalizeSerial(reference)) : undefined;
      if (!reference) uncoveredDecisions.push(toUncoveredDecisionDto(decision, 'MISSING_REFERENCE'));
      else if (!linked) uncoveredDecisions.push(toUncoveredDecisionDto(decision, 'REPORT_NOT_FOUND'));
      else if (isRangeIncidentReportVoided(linked.entries)) {
        uncoveredDecisions.push(toUncoveredDecisionDto(decision, 'REPORT_VOIDED'));
      }
    }

    return {
      eventId,
      reports: reports.map((report) => toReportDto(report, entriesByReport.get(report.id) ?? [], history)),
      requiredDecisionCount: active.length,
      coveredDecisionCount: active.length - uncoveredDecisions.length,
      uncoveredDecisions,
    };
  }

  private findDecisionHistory(eventId: string): ScoringDecision[] {
    return [
      ...this.decisions.findByEventId(eventId, 'QUALIFICATION'),
      ...this.decisions.findByEventId(eventId, 'FINAL'),
    ];
  }
}

function toReportDto(
  report: RangeIncidentReport,
  entries: readonly RangeIncidentReportEntry[],
  decisionHistory: readonly ScoringDecision[],
): RangeIncidentReportDto {
  const signedRoles = new Set<IncidentReportOfficialRole>([report.initiatorRole]);
  for (const entry of entries) {
    if (entry.type === 'SIGNATURE' && entry.officialRole) signedRoles.add(entry.officialRole);
  }
  const activeIds = new Set(getActiveScoringDecisions(decisionHistory).map((decision) => decision.id));
  const linkedDecisions = decisionHistory
    .filter(
      (decision) =>
        decision.incidentReportNumber !== null &&
        normalizeSerial(decision.incidentReportNumber) === normalizeSerial(report.serialNumber),
    )
    .map((decision) => toLinkedDecisionDto(decision, activeIds.has(decision.id)));
  return {
    id: report.id,
    eventId: report.eventId,
    serialNumber: report.serialNumber,
    eventName: report.eventName,
    occurredAt: report.occurredAt.toISOString(),
    relayNumber: report.relayNumber,
    firingPointNumber: report.firingPointNumber,
    athleteName: report.athleteName,
    bibNumber: report.bibNumber,
    nationality: report.nationality,
    stage: report.stage,
    series: report.series,
    details: report.details,
    ruleReferences: report.ruleReferences,
    penalty: report.penalty,
    scoreAmendmentReference: report.scoreAmendmentReference,
    initiatorRole: report.initiatorRole,
    initiatorName: report.initiatorName,
    createdAt: report.createdAt.toISOString(),
    entries: entries.map(toEntryDto),
    linkedDecisions,
    missingSignatureRoles: REQUIRED_SIGNATURE_ROLES.filter((role) => !signedRoles.has(role)),
    forwarded: entries.some((entry) => entry.type === 'FORWARDED'),
    voided: isRangeIncidentReportVoided(entries),
  };
}

function toEntryDto(entry: RangeIncidentReportEntry): IncidentReportEntryDto {
  return {
    id: entry.id,
    reportId: entry.reportId,
    type: entry.type,
    officialRole: entry.officialRole,
    destination: entry.destination,
    statement: entry.statement,
    officialName: entry.officialName,
    recordedAt: entry.recordedAt.toISOString(),
  };
}

function toLinkedDecisionDto(decision: ScoringDecision, active: boolean): IncidentReportLinkedDecisionDto {
  return {
    id: decision.id,
    participantId: decision.participantId,
    relayNumber: decision.relayNumber,
    resultScope: decision.resultScope,
    resultId: decision.resultIdAtDecision,
    type: decision.type,
    ruleReference: decision.ruleReference,
    publicRemark: decision.publicRemark,
    officialName: decision.officialName,
    decidedAt: decision.decidedAt.toISOString(),
    active,
  };
}

function toUncoveredDecisionDto(
  decision: ScoringDecision,
  coverageIssue: UncoveredIncidentDecisionDto['coverageIssue'],
): UncoveredIncidentDecisionDto {
  return {
    ...toLinkedDecisionDto(decision, true),
    incidentReportNumber: decision.incidentReportNumber,
    coverageIssue,
  };
}

function normalizeSerial(value: string): string {
  return value.trim().toUpperCase();
}
