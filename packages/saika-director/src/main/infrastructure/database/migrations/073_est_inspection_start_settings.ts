import type { Migration } from './Migration';

export const migration073EstInspectionStartSettings: Migration = {
  version: 73,
  name: 'est_inspection_start_settings',
  up(db) {
    db.exec(`CREATE TABLE est_inspection_start_settings (
      competition_id TEXT PRIMARY KEY, settings_json TEXT NOT NULL CHECK(json_valid(settings_json))
    )`);
  },
};
