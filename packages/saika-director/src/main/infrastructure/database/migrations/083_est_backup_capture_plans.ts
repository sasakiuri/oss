import type { Migration } from './Migration';

export const migration083EstBackupCapturePlans: Migration = {
  version: 83,
  name: 'est_backup_capture_plans',
  up(db) {
    db.exec(`CREATE TABLE est_backup_capture_plans (
      event_id TEXT PRIMARY KEY,
      plan_json TEXT NOT NULL CHECK (json_valid(plan_json))
    )`);
  },
};
