import type { Migration } from './Migration';

export const migration014RangeIncidentReports: Migration = {
  version: 14,
  name: 'range_incident_reports',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS range_incident_reports (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL,
        serial_number TEXT NOT NULL COLLATE NOCASE,
        event_name TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        relay_number INTEGER CHECK (relay_number IS NULL OR relay_number > 0),
        firing_point_number INTEGER CHECK (firing_point_number IS NULL OR firing_point_number > 0),
        athlete_name TEXT,
        bib_number TEXT,
        nationality TEXT,
        stage TEXT,
        series TEXT,
        details TEXT NOT NULL,
        rule_references TEXT NOT NULL,
        penalty TEXT,
        score_amendment_reference TEXT,
        initiator_role TEXT NOT NULL CHECK (initiator_role IN (
          'RANGE_OFFICER',
          'COMPETITION_JURY_MEMBER',
          'RTS_OFFICER',
          'RTS_JURY_MEMBER',
          'RANKING_TECHNICAL_OFFICER',
          'OTHER_OFFICIAL'
        )),
        initiator_name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE (event_id, serial_number)
      );

      CREATE INDEX IF NOT EXISTS idx_range_incident_reports_event
        ON range_incident_reports(event_id, occurred_at, id);

      CREATE TABLE IF NOT EXISTS range_incident_report_entries (
        id TEXT PRIMARY KEY,
        report_id TEXT NOT NULL REFERENCES range_incident_reports(id),
        entry_type TEXT NOT NULL CHECK (entry_type IN ('SIGNATURE', 'FORWARDED', 'NOTE', 'VOID')),
        official_role TEXT CHECK (official_role IS NULL OR official_role IN (
          'RANGE_OFFICER',
          'COMPETITION_JURY_MEMBER',
          'RTS_OFFICER',
          'RTS_JURY_MEMBER',
          'RANKING_TECHNICAL_OFFICER',
          'OTHER_OFFICIAL'
        )),
        destination TEXT,
        statement TEXT NOT NULL,
        official_name TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        CHECK (
          (entry_type = 'SIGNATURE' AND official_role IS NOT NULL AND destination IS NULL)
          OR (entry_type = 'FORWARDED' AND official_role IS NULL AND destination IS NOT NULL)
          OR (entry_type IN ('NOTE', 'VOID') AND official_role IS NULL AND destination IS NULL)
        )
      );

      CREATE INDEX IF NOT EXISTS idx_range_incident_report_entries_report
        ON range_incident_report_entries(report_id, recorded_at, id);
      CREATE UNIQUE INDEX IF NOT EXISTS uq_range_incident_report_single_void
        ON range_incident_report_entries(report_id)
        WHERE entry_type = 'VOID';
    `);
  },
};
