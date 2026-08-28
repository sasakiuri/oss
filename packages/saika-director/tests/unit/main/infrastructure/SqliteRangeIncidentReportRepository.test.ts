import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { migration014RangeIncidentReports } from '@/main/infrastructure/database/migrations/014_range_incident_reports';
import { RangeIncidentReport } from '@/main/modules/incident-reports/domain/RangeIncidentReport';
import { RangeIncidentReportEntry } from '@/main/modules/incident-reports/domain/RangeIncidentReportEntry';
import { SqliteRangeIncidentReportRepository } from '@/main/modules/incident-reports/infra/SqliteRangeIncidentReportRepository';

describe('SqliteRangeIncidentReportRepository', () => {
  let database: Database.Database;
  let repository: SqliteRangeIncidentReportRepository;

  beforeEach(() => {
    database = new Database(':memory:');
    database.pragma('foreign_keys = ON');
    migration014RangeIncidentReports.up(database);
    repository = new SqliteRangeIncidentReportRepository(database);
  });

  afterEach(() => database.close());

  it('retains immutable reports and same-instant audit entries in append order', () => {
    const report = RangeIncidentReport.create({
      eventId: '11111111-1111-4111-8111-111111111111',
      serialNumber: 'IR-42',
      eventName: '10m Air Rifle',
      occurredAt: new Date('2026-08-29T01:02:03.000Z'),
      relayNumber: 2,
      firingPointNumber: 12,
      athleteName: 'Alex Athlete',
      bibNumber: '42',
      nationality: 'JPN',
      stage: 'Qualification',
      series: '3',
      details: 'Target stopped responding during the series.',
      ruleReferences: '6.14.6',
      penalty: 'No penalty; extra time granted.',
      scoreAmendmentReference: 'CN-9',
      initiatorRole: 'RANGE_OFFICER',
      initiatorName: 'Range Officer A',
      createdAt: new Date('2026-08-29T01:05:00.000Z'),
    });
    const recordedAt = new Date('2026-08-29T01:06:00.000Z');
    const signature = RangeIncidentReportEntry.createSignature({
      reportId: report.id,
      officialRole: 'COMPETITION_JURY_MEMBER',
      statement: 'Reviewed and signed',
      officialName: 'Jury A',
      recordedAt,
    });
    const forwarding = RangeIncidentReportEntry.createForwarding({
      reportId: report.id,
      destination: 'RTS Office',
      statement: 'Copy forwarded',
      officialName: 'Range Officer A',
      recordedAt,
    });

    repository.appendReport(report);
    repository.appendEntry(signature);
    repository.appendEntry(forwarding);

    expect(repository.findReportById(report.id)).toEqual(report);
    expect(repository.findReportBySerial(report.eventId, 'ir-42')).toEqual(report);
    expect(repository.findReportsByEvent(report.eventId)).toEqual([report]);
    expect(repository.findEntriesByReportIds([report.id]).get(report.id)).toEqual([signature, forwarding]);
  });

  it('rejects a second serial for the same event regardless of case', () => {
    const create = (serialNumber: string) =>
      RangeIncidentReport.create({
        eventId: '11111111-1111-4111-8111-111111111111',
        serialNumber,
        eventName: '10m Air Rifle',
        occurredAt: new Date('2026-08-29T01:02:03.000Z'),
        details: 'Incident',
        ruleReferences: '6.14.6',
        initiatorRole: 'RANGE_OFFICER',
        initiatorName: 'Range Officer A',
      });

    repository.appendReport(create('IR-42'));
    expect(() => repository.appendReport(create('ir-42'))).toThrow();
  });
});
