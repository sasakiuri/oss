import type { Migration } from './Migration';

export const migration072RelayReadinessStartSettings: Migration = {
  version: 72,
  name: 'relay_readiness_start_settings',
  up(db) {
    db.exec(`CREATE TABLE relay_readiness_start_settings (
      competition_id TEXT PRIMARY KEY,
      relay_number INTEGER NOT NULL CHECK(relay_number > 0),
      mode TEXT NOT NULL CHECK(mode IN ('DISABLED', 'ADVISORY', 'REQUIRED'))
    )`);
  },
};
