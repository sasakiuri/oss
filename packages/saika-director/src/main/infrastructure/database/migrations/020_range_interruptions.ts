import type { Migration } from './Migration';

export const migration020RangeInterruptions: Migration = {
  version: 20,
  name: 'range_interruptions',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS range_interruption_cases (
        id TEXT PRIMARY KEY,
        cause TEXT NOT NULL CHECK (cause IN (
          'ATHLETE_NON_FAULT',
          'ALL_TARGET_FAILURE',
          'SINGLE_TARGET_FAILURE',
          'FIRING_POINT_MOVE',
          'OTHER'
        )),
        phase TEXT NOT NULL CHECK (phase IN ('SIGHTING', 'MATCH')),
        started_at TEXT NOT NULL,
        remaining_seconds_at_start INTEGER NOT NULL CHECK (remaining_seconds_at_start >= 0),
        lane_id TEXT,
        firing_point_number INTEGER CHECK (firing_point_number IS NULL OR firing_point_number > 0),
        athlete_name TEXT,
        summary TEXT NOT NULL,
        details TEXT NOT NULL,
        opened_by TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_range_interruption_cases_started
        ON range_interruption_cases(started_at, id);

      CREATE TABLE IF NOT EXISTS range_interruption_scope_links (
        id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL REFERENCES range_interruption_cases(id),
        scope_type TEXT NOT NULL CHECK (scope_type IN ('COMPETITION', 'EVENT')),
        scope_id TEXT NOT NULL,
        linked_by TEXT NOT NULL,
        note TEXT,
        linked_at TEXT NOT NULL,
        UNIQUE (case_id, scope_type, scope_id)
      );

      CREATE INDEX IF NOT EXISTS idx_range_interruption_scope_lookup
        ON range_interruption_scope_links(scope_type, scope_id, linked_at, case_id);

      CREATE TABLE IF NOT EXISTS range_interruption_entries (
        id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL REFERENCES range_interruption_cases(id),
        entry_type TEXT NOT NULL CHECK (entry_type IN (
          'PAUSE_APPLIED',
          'ENDED',
          'TIME_GRANTED',
          'RESUME_APPLIED',
          'MATCH_RESUMED',
          'NOTE',
          'CLOSED',
          'REOPENED',
          'VOID'
        )),
        occurred_at TEXT NOT NULL,
        statement TEXT NOT NULL,
        official_name TEXT NOT NULL,
        rule_reference TEXT,
        lost_time_seconds INTEGER CHECK (lost_time_seconds IS NULL OR lost_time_seconds >= 0),
        extension_seconds INTEGER CHECK (extension_seconds IS NULL OR extension_seconds >= 0),
        authorized_remaining_seconds INTEGER CHECK (
          authorized_remaining_seconds IS NULL OR authorized_remaining_seconds >= 0
        ),
        unlimited_sighting_shots INTEGER CHECK (
          unlimited_sighting_shots IS NULL OR unlimited_sighting_shots IN (0, 1)
        ),
        incident_report_reference TEXT,
        command_id TEXT,
        recorded_at TEXT NOT NULL,
        CHECK (entry_type <> 'ENDED' OR lost_time_seconds IS NOT NULL),
        CHECK (
          entry_type <> 'TIME_GRANTED' OR (
            extension_seconds IS NOT NULL AND
            authorized_remaining_seconds IS NOT NULL AND
            unlimited_sighting_shots IS NOT NULL AND
            incident_report_reference IS NOT NULL AND
            rule_reference IS NOT NULL
          )
        ),
        CHECK (
          entry_type NOT IN ('PAUSE_APPLIED', 'RESUME_APPLIED', 'MATCH_RESUMED') OR command_id IS NOT NULL
        )
      );

      CREATE INDEX IF NOT EXISTS idx_range_interruption_entries_case
        ON range_interruption_entries(case_id, occurred_at, id);

      CREATE TRIGGER IF NOT EXISTS trg_range_interruption_cases_no_update
      BEFORE UPDATE ON range_interruption_cases
      BEGIN
        SELECT RAISE(ABORT, 'Range interruption cases are append-only');
      END;

      CREATE TRIGGER IF NOT EXISTS trg_range_interruption_cases_no_delete
      BEFORE DELETE ON range_interruption_cases
      BEGIN
        SELECT RAISE(ABORT, 'Range interruption cases are append-only');
      END;

      CREATE TRIGGER IF NOT EXISTS trg_range_interruption_scopes_no_update
      BEFORE UPDATE ON range_interruption_scope_links
      BEGIN
        SELECT RAISE(ABORT, 'Range interruption scope links are append-only');
      END;

      CREATE TRIGGER IF NOT EXISTS trg_range_interruption_scopes_no_delete
      BEFORE DELETE ON range_interruption_scope_links
      BEGIN
        SELECT RAISE(ABORT, 'Range interruption scope links are append-only');
      END;

      CREATE TRIGGER IF NOT EXISTS trg_range_interruption_entries_no_update
      BEFORE UPDATE ON range_interruption_entries
      BEGIN
        SELECT RAISE(ABORT, 'Range interruption entries are append-only');
      END;

      CREATE TRIGGER IF NOT EXISTS trg_range_interruption_entries_no_delete
      BEFORE DELETE ON range_interruption_entries
      BEGIN
        SELECT RAISE(ABORT, 'Range interruption entries are append-only');
      END;
    `);
  },
};
