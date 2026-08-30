import type { Migration } from './Migration';

export const migration037AdjudicationCases: Migration = {
  version: 37,
  name: 'adjudication_cases',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS adjudication_cases (
        id TEXT PRIMARY KEY,
        scope_type TEXT NOT NULL CHECK (scope_type IN ('EVENT', 'COMPETITION')),
        scope_id TEXT NOT NULL,
        category TEXT NOT NULL CHECK (category IN (
          'SCORING', 'RANGE_INCIDENT', 'PROTEST', 'MALFUNCTION', 'TARGET_FAILURE',
          'COMMAND_ERROR', 'FINAL', 'OTHER'
        )),
        subject TEXT NOT NULL,
        summary TEXT NOT NULL,
        opened_by TEXT NOT NULL,
        opened_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_adjudication_cases_scope
        ON adjudication_cases(scope_type, scope_id, opened_at, id);

      CREATE TABLE IF NOT EXISTS adjudication_case_entries (
        id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL REFERENCES adjudication_cases(id),
        entry_type TEXT NOT NULL CHECK (entry_type IN ('NOTE', 'REFERRED', 'RESOLVED', 'REOPENED', 'CLOSED', 'VOID')),
        statement TEXT NOT NULL,
        official_name TEXT NOT NULL,
        rule_reference TEXT,
        occurred_at TEXT NOT NULL,
        recorded_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_adjudication_case_entries_case
        ON adjudication_case_entries(case_id, recorded_at, id);

      CREATE TABLE IF NOT EXISTS adjudication_case_links (
        id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL REFERENCES adjudication_cases(id),
        operation TEXT NOT NULL CHECK (operation IN ('ADD', 'REMOVE')),
        artifact_type TEXT NOT NULL CHECK (artifact_type IN (
          'SCORING_DECISION', 'RANGE_INCIDENT_REPORT', 'PROTEST', 'RANGE_INTERRUPTION',
          'TARGET_EXAMINATION', 'FINAL_OPERATION', 'OTHER'
        )),
        artifact_id TEXT NOT NULL,
        relation TEXT NOT NULL CHECK (relation IN ('SOURCE', 'EVIDENCE', 'DECISION', 'REPORT', 'PROTEST', 'RECOVERY', 'RELATED')),
        label_snapshot TEXT NOT NULL,
        statement TEXT NOT NULL,
        official_name TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        reverses_link_id TEXT REFERENCES adjudication_case_links(id),
        CHECK (
          (operation = 'ADD' AND reverses_link_id IS NULL)
          OR (operation = 'REMOVE' AND reverses_link_id IS NOT NULL)
        )
      );

      CREATE INDEX IF NOT EXISTS idx_adjudication_case_links_case
        ON adjudication_case_links(case_id, recorded_at, id);
      CREATE UNIQUE INDEX IF NOT EXISTS uq_adjudication_case_link_removal
        ON adjudication_case_links(reverses_link_id) WHERE operation = 'REMOVE';

      CREATE TRIGGER IF NOT EXISTS trg_adjudication_cases_no_update BEFORE UPDATE ON adjudication_cases
      BEGIN SELECT RAISE(ABORT, 'Adjudication cases are append-only'); END;
      CREATE TRIGGER IF NOT EXISTS trg_adjudication_cases_no_delete BEFORE DELETE ON adjudication_cases
      BEGIN SELECT RAISE(ABORT, 'Adjudication cases are append-only'); END;
      CREATE TRIGGER IF NOT EXISTS trg_adjudication_case_entries_no_update BEFORE UPDATE ON adjudication_case_entries
      BEGIN SELECT RAISE(ABORT, 'Adjudication entries are append-only'); END;
      CREATE TRIGGER IF NOT EXISTS trg_adjudication_case_entries_no_delete BEFORE DELETE ON adjudication_case_entries
      BEGIN SELECT RAISE(ABORT, 'Adjudication entries are append-only'); END;
      CREATE TRIGGER IF NOT EXISTS trg_adjudication_case_links_no_update BEFORE UPDATE ON adjudication_case_links
      BEGIN SELECT RAISE(ABORT, 'Adjudication links are append-only'); END;
      CREATE TRIGGER IF NOT EXISTS trg_adjudication_case_links_no_delete BEFORE DELETE ON adjudication_case_links
      BEGIN SELECT RAISE(ABORT, 'Adjudication links are append-only'); END;
    `);
  },
};
