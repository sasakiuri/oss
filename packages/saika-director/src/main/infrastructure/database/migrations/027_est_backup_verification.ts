import type { Migration } from './Migration';

export const migration027EstBackupVerification: Migration = {
  version: 27,
  name: 'est_backup_verification',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS est_backup_verification_runs (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL,
        result_kind TEXT NOT NULL CHECK (result_kind IN ('INDIVIDUAL', 'TEAM', 'MIXED_TEAM')),
        key_type TEXT NOT NULL CHECK (key_type IN ('PARTICIPANT_ID', 'START_NUMBER', 'ISSF_ID', 'TEAM_ID')),
        source_name TEXT NOT NULL,
        source_reference TEXT,
        records_json TEXT NOT NULL CHECK (json_valid(records_json)),
        comparison_json TEXT NOT NULL CHECK (json_valid(comparison_json)),
        snapshot_revision TEXT NOT NULL,
        intervention_review_statement TEXT,
        verified INTEGER NOT NULL CHECK (verified IN (0, 1)),
        official_name TEXT NOT NULL,
        verified_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_est_backup_verification_event
        ON est_backup_verification_runs(event_id, verified_at, id);
      CREATE TRIGGER IF NOT EXISTS trg_est_backup_verification_no_update
      BEFORE UPDATE ON est_backup_verification_runs
      BEGIN SELECT RAISE(ABORT, 'EST backup verification runs are append-only'); END;
      CREATE TRIGGER IF NOT EXISTS trg_est_backup_verification_no_delete
      BEFORE DELETE ON est_backup_verification_runs
      BEGIN SELECT RAISE(ABORT, 'EST backup verification runs are append-only'); END;
    `);
  },
};
