import type { Migration } from './Migration';

export const migration019TargetExaminations: Migration = {
  version: 19,
  name: 'target_examinations',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS target_examination_cases (
        id TEXT PRIMARY KEY,
        issue_kind TEXT NOT NULL CHECK (issue_kind IN (
          'SIGHTING_COMPLAINT',
          'NO_SHOT_INDICATION',
          'UNEXPECTED_ZERO',
          'SCORE_VALUE_PROTEST',
          'PAPER_OR_RUBBER_FAILURE',
          'SINGLE_TARGET_FAILURE',
          'RANGE_TARGET_FAILURE',
          'OTHER'
        )),
        occurred_at TEXT NOT NULL,
        lane_id TEXT,
        firing_point_number INTEGER CHECK (firing_point_number IS NULL OR firing_point_number > 0),
        relay_number INTEGER CHECK (relay_number IS NULL OR relay_number > 0),
        athlete_name TEXT,
        shot_id TEXT,
        summary TEXT NOT NULL,
        details TEXT NOT NULL,
        rule_references TEXT NOT NULL,
        opened_by TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_target_examination_cases_occurred
        ON target_examination_cases(occurred_at, id);

      CREATE TABLE IF NOT EXISTS target_examination_scope_links (
        id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL REFERENCES target_examination_cases(id),
        scope_type TEXT NOT NULL CHECK (scope_type IN ('COMPETITION', 'EVENT')),
        scope_id TEXT NOT NULL,
        linked_by TEXT NOT NULL,
        note TEXT,
        linked_at TEXT NOT NULL,
        UNIQUE (case_id, scope_type, scope_id)
      );

      CREATE INDEX IF NOT EXISTS idx_target_examination_scope_lookup
        ON target_examination_scope_links(scope_type, scope_id, linked_at, case_id);

      CREATE TABLE IF NOT EXISTS target_examination_evidence (
        id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL REFERENCES target_examination_cases(id),
        evidence_type TEXT NOT NULL CHECK (evidence_type IN (
          'CONTROL_SHEET',
          'BACKING_CARD',
          'BACKING_TARGET',
          'WITNESS_STRIP',
          'RUBBER_BAND',
          'RANGE_INCIDENT_REPORT',
          'EST_LOG_PRINT',
          'EST_COMPUTER_RECORD',
          'TARGET_FACE',
          'OTHER'
        )),
        description TEXT NOT NULL,
        reference TEXT,
        content_hash_sha256 TEXT CHECK (content_hash_sha256 IS NULL OR length(content_hash_sha256) = 64),
        collected_by TEXT NOT NULL,
        collected_at TEXT NOT NULL,
        recorded_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_target_examination_evidence_case
        ON target_examination_evidence(case_id, recorded_at, id);

      CREATE TABLE IF NOT EXISTS target_examination_entries (
        id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL REFERENCES target_examination_cases(id),
        entry_type TEXT NOT NULL CHECK (entry_type IN (
          'NOTE',
          'DECISION',
          'HOLD_RELEASED',
          'HOLD_REINSTATED',
          'CLOSED',
          'REOPENED',
          'VOID'
        )),
        statement TEXT NOT NULL,
        rule_reference TEXT,
        official_name TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        CHECK (entry_type <> 'DECISION' OR rule_reference IS NOT NULL)
      );

      CREATE INDEX IF NOT EXISTS idx_target_examination_entries_case
        ON target_examination_entries(case_id, recorded_at, id);

      CREATE TRIGGER IF NOT EXISTS trg_target_examination_cases_no_update
      BEFORE UPDATE ON target_examination_cases
      BEGIN
        SELECT RAISE(ABORT, 'Target examination cases are append-only');
      END;

      CREATE TRIGGER IF NOT EXISTS trg_target_examination_cases_no_delete
      BEFORE DELETE ON target_examination_cases
      BEGIN
        SELECT RAISE(ABORT, 'Target examination cases are append-only');
      END;

      CREATE TRIGGER IF NOT EXISTS trg_target_examination_scopes_no_update
      BEFORE UPDATE ON target_examination_scope_links
      BEGIN
        SELECT RAISE(ABORT, 'Target examination scope links are append-only');
      END;

      CREATE TRIGGER IF NOT EXISTS trg_target_examination_scopes_no_delete
      BEFORE DELETE ON target_examination_scope_links
      BEGIN
        SELECT RAISE(ABORT, 'Target examination scope links are append-only');
      END;

      CREATE TRIGGER IF NOT EXISTS trg_target_examination_evidence_no_update
      BEFORE UPDATE ON target_examination_evidence
      BEGIN
        SELECT RAISE(ABORT, 'Target examination evidence is append-only');
      END;

      CREATE TRIGGER IF NOT EXISTS trg_target_examination_evidence_no_delete
      BEFORE DELETE ON target_examination_evidence
      BEGIN
        SELECT RAISE(ABORT, 'Target examination evidence is append-only');
      END;

      CREATE TRIGGER IF NOT EXISTS trg_target_examination_entries_no_update
      BEFORE UPDATE ON target_examination_entries
      BEGIN
        SELECT RAISE(ABORT, 'Target examination entries are append-only');
      END;

      CREATE TRIGGER IF NOT EXISTS trg_target_examination_entries_no_delete
      BEFORE DELETE ON target_examination_entries
      BEGIN
        SELECT RAISE(ABORT, 'Target examination entries are append-only');
      END;
    `);
  },
};
