import type { Migration } from './Migration';

export const migration006LaneState: Migration = {
  version: 6,
  name: 'lane_state',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS lane_state (
        id TEXT PRIMARY KEY,
        channel INTEGER NOT NULL,
        state_json TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  },
};
