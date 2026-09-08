import type { Migration } from './Migration';

export const migration082EstBackupSources: Migration = {
  version: 82,
  name: 'est_backup_sources',
  up(db) {
    db.exec(`CREATE TABLE est_backup_sources (
      id TEXT PRIMARY KEY, event_id TEXT NOT NULL, payload_json TEXT NOT NULL CHECK(json_valid(payload_json)));
      CREATE INDEX idx_est_backup_sources_event ON est_backup_sources(event_id);
      CREATE TRIGGER trg_est_backup_source_no_update BEFORE UPDATE ON est_backup_sources
      BEGIN SELECT RAISE(ABORT, 'EST backup sources are append-only'); END;
      CREATE TRIGGER trg_est_backup_source_no_delete BEFORE DELETE ON est_backup_sources
      BEGIN SELECT RAISE(ABORT, 'EST backup sources are append-only'); END;
      ALTER TABLE est_backup_verification_runs ADD COLUMN source_id TEXT REFERENCES est_backup_sources(id);`);
  },
};
