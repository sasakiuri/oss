import type { Migration } from './Migration';

export const migration080EstBackupResultScope: Migration = {
  version: 80,
  name: 'est_backup_result_scope',
  up(db) {
    db.exec(`ALTER TABLE est_backup_verification_runs ADD COLUMN result_scope TEXT NOT NULL
      DEFAULT 'QUALIFICATION' CHECK (result_scope IN ('QUALIFICATION', 'FINAL'));`);
  },
};
