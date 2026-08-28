import type { Migration } from './Migration';

export const migration013ResultVerification: Migration = {
  version: 13,
  name: 'result_verification',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS result_verification_checks (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL,
        result_id TEXT NOT NULL,
        participant_id TEXT NOT NULL,
        player_name TEXT NOT NULL,
        result_revision TEXT NOT NULL,
        result_rank INTEGER NOT NULL CHECK (result_rank > 0),
        score_x10 INTEGER NOT NULL CHECK (score_x10 >= 0),
        decision_count_at_check INTEGER NOT NULL CHECK (decision_count_at_check >= 0),
        evidence_source TEXT NOT NULL
          CHECK (evidence_source IN ('TARGET_PRINTOUT', 'INDEPENDENT_MEMORY', 'OTHER')),
        evidence_reference TEXT NOT NULL,
        comparison_status TEXT NOT NULL
          CHECK (comparison_status IN ('MATCHED', 'MISMATCH', 'UNAVAILABLE')),
        manual_interventions_reviewed INTEGER NOT NULL
          CHECK (manual_interventions_reviewed IN (0, 1)),
        note TEXT,
        official_name TEXT NOT NULL,
        checked_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_result_verification_checks_event_result
        ON result_verification_checks(event_id, result_id, checked_at, id);

      CREATE TABLE IF NOT EXISTS result_list_approval_entries (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL,
        result_scope TEXT NOT NULL CHECK (result_scope IN ('QUALIFICATION', 'FINAL')),
        entry_type TEXT NOT NULL CHECK (entry_type IN ('APPROVAL', 'REVOCATION')),
        snapshot_revision TEXT NOT NULL,
        required_individual_checks INTEGER NOT NULL CHECK (required_individual_checks >= 0),
        required_team_checks INTEGER NOT NULL CHECK (required_team_checks >= 0),
        check_ids_json TEXT NOT NULL,
        statement TEXT NOT NULL,
        official_name TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        reverses_approval_id TEXT REFERENCES result_list_approval_entries(id)
      );

      CREATE INDEX IF NOT EXISTS idx_result_list_approval_entries_event
        ON result_list_approval_entries(event_id, result_scope, recorded_at, id);
      CREATE UNIQUE INDEX IF NOT EXISTS uq_result_list_approval_single_revocation
        ON result_list_approval_entries(reverses_approval_id)
        WHERE reverses_approval_id IS NOT NULL;
    `);
  },
};
