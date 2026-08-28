import type Database from 'better-sqlite3';

import type { IRangeIncidentReportRepository } from '../domain/IRangeIncidentReportRepository';
import { RangeIncidentReport } from '../domain/RangeIncidentReport';
import {
  RangeIncidentReportEntry,
  type IncidentReportEntryType,
  type IncidentReportOfficialRole,
} from '../domain/RangeIncidentReportEntry';

interface ReportRow {
  id: string;
  event_id: string;
  serial_number: string;
  event_name: string;
  occurred_at: string;
  relay_number: number | null;
  firing_point_number: number | null;
  athlete_name: string | null;
  bib_number: string | null;
  nationality: string | null;
  stage: string | null;
  series: string | null;
  details: string;
  rule_references: string;
  penalty: string | null;
  score_amendment_reference: string | null;
  initiator_role: IncidentReportOfficialRole;
  initiator_name: string;
  created_at: string;
}

interface EntryRow {
  id: string;
  report_id: string;
  entry_type: IncidentReportEntryType;
  official_role: IncidentReportOfficialRole | null;
  destination: string | null;
  statement: string;
  official_name: string;
  recorded_at: string;
}

export class SqliteRangeIncidentReportRepository implements IRangeIncidentReportRepository {
  constructor(private readonly db: Database.Database) {}

  appendReport(report: RangeIncidentReport): void {
    this.db
      .prepare(
        `INSERT INTO range_incident_reports (
           id, event_id, serial_number, event_name, occurred_at, relay_number,
           firing_point_number, athlete_name, bib_number, nationality, stage,
           series, details, rule_references, penalty, score_amendment_reference,
           initiator_role, initiator_name, created_at
         ) VALUES (
           @id, @eventId, @serialNumber, @eventName, @occurredAt, @relayNumber,
           @firingPointNumber, @athleteName, @bibNumber, @nationality, @stage,
           @series, @details, @ruleReferences, @penalty, @scoreAmendmentReference,
           @initiatorRole, @initiatorName, @createdAt
         )`,
      )
      .run({
        ...report,
        occurredAt: report.occurredAt.toISOString(),
        createdAt: report.createdAt.toISOString(),
      });
  }

  findReportById(id: string): RangeIncidentReport | null {
    const row = this.db.prepare('SELECT * FROM range_incident_reports WHERE id = ?').get(id) as ReportRow | undefined;
    return row ? toReport(row) : null;
  }

  findReportBySerial(eventId: string, serialNumber: string): RangeIncidentReport | null {
    const row = this.db
      .prepare('SELECT * FROM range_incident_reports WHERE event_id = ? AND serial_number = ? COLLATE NOCASE')
      .get(eventId, serialNumber) as ReportRow | undefined;
    return row ? toReport(row) : null;
  }

  findReportsByEvent(eventId: string): RangeIncidentReport[] {
    const rows = this.db
      .prepare('SELECT * FROM range_incident_reports WHERE event_id = ? ORDER BY occurred_at, rowid')
      .all(eventId) as ReportRow[];
    return rows.map(toReport);
  }

  appendEntry(entry: RangeIncidentReportEntry): void {
    this.db
      .prepare(
        `INSERT INTO range_incident_report_entries (
           id, report_id, entry_type, official_role, destination,
           statement, official_name, recorded_at
         ) VALUES (
           @id, @reportId, @type, @officialRole, @destination,
           @statement, @officialName, @recordedAt
         )`,
      )
      .run({ ...entry, recordedAt: entry.recordedAt.toISOString() });
  }

  findEntriesByReportIds(reportIds: readonly string[]): Map<string, RangeIncidentReportEntry[]> {
    const result = new Map<string, RangeIncidentReportEntry[]>();
    for (const reportId of reportIds) result.set(reportId, []);
    if (reportIds.length === 0) return result;

    const placeholders = reportIds.map(() => '?').join(', ');
    const rows = this.db
      .prepare(
        `SELECT * FROM range_incident_report_entries
         WHERE report_id IN (${placeholders})
         ORDER BY recorded_at, rowid`,
      )
      .all(...reportIds) as EntryRow[];
    for (const row of rows) result.get(row.report_id)?.push(toEntry(row));
    return result;
  }
}

function toReport(row: ReportRow): RangeIncidentReport {
  return RangeIncidentReport.reconstruct({
    id: row.id,
    eventId: row.event_id,
    serialNumber: row.serial_number,
    eventName: row.event_name,
    occurredAt: new Date(row.occurred_at),
    relayNumber: row.relay_number,
    firingPointNumber: row.firing_point_number,
    athleteName: row.athlete_name,
    bibNumber: row.bib_number,
    nationality: row.nationality,
    stage: row.stage,
    series: row.series,
    details: row.details,
    ruleReferences: row.rule_references,
    penalty: row.penalty,
    scoreAmendmentReference: row.score_amendment_reference,
    initiatorRole: row.initiator_role,
    initiatorName: row.initiator_name,
    createdAt: new Date(row.created_at),
  });
}

function toEntry(row: EntryRow): RangeIncidentReportEntry {
  return RangeIncidentReportEntry.reconstruct({
    id: row.id,
    reportId: row.report_id,
    type: row.entry_type,
    officialRole: row.official_role,
    destination: row.destination,
    statement: row.statement,
    officialName: row.official_name,
    recordedAt: new Date(row.recorded_at),
  });
}
