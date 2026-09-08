import type { Migration } from './Migration';

export const migration084BackupCaptureReadiness: Migration = {
  version: 84,
  name: 'backup_capture_readiness',
  up(db) {
    db.exec(`CREATE TABLE backup_capture_readiness_settings (
      competition_id TEXT PRIMARY KEY,
      settings_json TEXT NOT NULL CHECK (json_valid(settings_json))
    )`);
  },
};
