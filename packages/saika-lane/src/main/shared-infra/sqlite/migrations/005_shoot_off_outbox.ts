// SPDX-License-Identifier: MIT
import type { Migration } from './Migration';

export const migration005: Migration = {
  version: 5,
  name: 'shoot_off_outbox',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS competition_shoot_off_shot_outbox (
        shot_id TEXT PRIMARY KEY,
        competition_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        iteration INTEGER NOT NULL CHECK(iteration > 0),
        lane_id TEXT NOT NULL,
        payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
        created_at TEXT NOT NULL,
        published_at TEXT,
        UNIQUE(run_id, iteration, lane_id)
      );

      CREATE INDEX IF NOT EXISTS idx_competition_shoot_off_shot_pending
        ON competition_shoot_off_shot_outbox(published_at, created_at, shot_id);
    `);
  },
};
