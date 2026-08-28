import { describe, expect, it, vi } from 'vitest';

import { IncidentReportService } from '@/main/modules/incident-reports/application/IncidentReportService';
import type { IRangeIncidentReportRepository } from '@/main/modules/incident-reports/domain/IRangeIncidentReportRepository';
import type { RangeIncidentReport } from '@/main/modules/incident-reports/domain/RangeIncidentReport';
import type { RangeIncidentReportEntry } from '@/main/modules/incident-reports/domain/RangeIncidentReportEntry';
import type { IScoringDecisionRepository } from '@/main/modules/scoring-decisions';
import { ScoringDecision } from '@/main/modules/scoring-decisions/domain/ScoringDecision';
import type { QueryBus } from '@/main/shared-infra/cqrs/QueryBus';

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const RESULT_ID = '22222222-2222-4222-8222-222222222222';

function decision(incidentReportNumber?: string): ScoringDecision {
  return ScoringDecision.create({
    eventId: EVENT_ID,
    participantId: 'participant-1',
    relayNumber: 1,
    resultScope: 'QUALIFICATION',
    resultIdAtDecision: RESULT_ID,
    sourceCompetitionId: null,
    type: 'EXTRA_TIME',
    applicationPolicy: 'NONE',
    ruleReference: '6.11.3.2',
    incidentReportNumber,
    publicRemark: 'Five minutes extra time',
    officialName: 'Jury A',
  });
}

function harness(history: ScoringDecision[] = []) {
  const reports: RangeIncidentReport[] = [];
  const entries: RangeIncidentReportEntry[] = [];
  const repository: IRangeIncidentReportRepository = {
    appendReport: vi.fn((report) => reports.push(report)),
    findReportById: vi.fn((id) => reports.find((report) => report.id === id) ?? null),
    findReportBySerial: vi.fn(
      (eventId, serial) =>
        reports.find(
          (report) => report.eventId === eventId && report.serialNumber.toUpperCase() === serial.trim().toUpperCase(),
        ) ?? null,
    ),
    findReportsByEvent: vi.fn((eventId) => reports.filter((report) => report.eventId === eventId)),
    appendEntry: vi.fn((entry) => entries.push(entry)),
    findEntriesByReportIds: vi.fn((ids) => {
      const result = new Map<string, RangeIncidentReportEntry[]>();
      for (const id of ids)
        result.set(
          id,
          entries.filter((entry) => entry.reportId === id),
        );
      return result;
    }),
  };
  const decisions: IScoringDecisionRepository = {
    append: vi.fn((item) => history.push(item)),
    findById: vi.fn((id) => history.find((item) => item.id === id) ?? null),
    findByTarget: vi.fn(() => [...history]),
    findByEventId: vi.fn((eventId, scope) =>
      history.filter((item) => item.eventId === eventId && item.resultScope === scope),
    ),
  };
  const queryBus = {
    execute: vi.fn(async () => ({
      id: EVENT_ID,
      name: '10m Air Rifle',
      eventType: 'BR60S',
      round: 'Qualification',
      sortOrder: 0,
    })),
  } as unknown as QueryBus;
  return { service: new IncidentReportService(queryBus, repository, decisions), reports, entries };
}

async function createReport(service: IncidentReportService, serialNumber = 'IR-42') {
  return service.create({
    eventId: EVENT_ID,
    serialNumber,
    occurredAt: '2026-08-29T01:02:03.000Z',
    relayNumber: 1,
    firingPointNumber: 12,
    athleteName: 'Alex Athlete',
    details: 'Target stopped responding.',
    ruleReferences: '6.14.6',
    penalty: 'Extra time granted',
    initiatorRole: 'RANGE_OFFICER',
    initiatorName: 'Range Officer A',
  });
}

describe('IncidentReportService', () => {
  it('links substantive decisions by serial and projects signatures and forwarding independently', async () => {
    const { service } = harness([decision('ir-42')]);
    const created = await createReport(service);

    expect(created.linkedDecisions).toHaveLength(1);
    expect(created.missingSignatureRoles).not.toContain('RANGE_OFFICER');
    expect(created.forwarded).toBe(false);

    await service.appendEntry({
      reportId: created.id,
      type: 'SIGNATURE',
      officialRole: 'COMPETITION_JURY_MEMBER',
      officialName: 'Jury B',
    });
    await service.appendEntry({
      reportId: created.id,
      type: 'FORWARDED',
      destination: 'RTS Office',
      officialName: 'Range Officer A',
    });

    const status = await service.listByEvent(EVENT_ID);
    expect(status).toMatchObject({ requiredDecisionCount: 1, coveredDecisionCount: 1, uncoveredDecisions: [] });
    expect(status.reports[0]).toMatchObject({ forwarded: true, voided: false });
    expect(status.reports[0]?.missingSignatureRoles).not.toContain('COMPETITION_JURY_MEMBER');
  });

  it('distinguishes missing, unknown, and voided report references in the decision coverage audit', async () => {
    const history = [decision(), decision('IR-NOT-REGISTERED'), decision('IR-VOID')];
    const { service } = harness(history);
    const report = await createReport(service, 'IR-VOID');
    await service.appendEntry({
      reportId: report.id,
      type: 'VOID',
      statement: 'Created for the wrong event',
      officialName: 'Jury Chair',
    });

    const status = await service.listByEvent(EVENT_ID);

    expect(status).toMatchObject({ requiredDecisionCount: 3, coveredDecisionCount: 0 });
    expect(status.uncoveredDecisions.map((item) => item.coverageIssue)).toEqual([
      'MISSING_REFERENCE',
      'REPORT_NOT_FOUND',
      'REPORT_VOIDED',
    ]);
  });

  it('keeps voiding append-only and rejects later entries or duplicate serials', async () => {
    const { service, reports, entries } = harness();
    const report = await createReport(service);
    await service.appendEntry({
      reportId: report.id,
      type: 'VOID',
      statement: 'Duplicate paper form',
      officialName: 'Jury Chair',
    });

    await expect(
      service.appendEntry({
        reportId: report.id,
        type: 'NOTE',
        statement: 'Late note',
        officialName: 'Jury Chair',
      }),
    ).rejects.toThrow('voided');
    await expect(createReport(service, 'ir-42')).rejects.toThrow('already exists');
    expect(reports).toHaveLength(1);
    expect(entries).toHaveLength(1);
  });
});
