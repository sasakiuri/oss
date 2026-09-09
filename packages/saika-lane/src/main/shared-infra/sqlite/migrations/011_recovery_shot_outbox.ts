// SPDX-License-Identifier: MIT
import type { Migration } from './Migration';

export const migration011: Migration = {
  version: 11,
  name: 'recovery_shot_outbox',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS qualification_recovery_shot_outbox (
        shot_id TEXT PRIMARY KEY,
        competition_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        lane_id TEXT NOT NULL,
        payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
        created_at TEXT NOT NULL,
        published_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_qualification_recovery_shot_pending
        ON qualification_recovery_shot_outbox(published_at, created_at, shot_id);
      CREATE INDEX IF NOT EXISTS idx_qualification_recovery_shot_run
        ON qualification_recovery_shot_outbox(run_id, lane_id, created_at, shot_id);
    `);
  },
};
