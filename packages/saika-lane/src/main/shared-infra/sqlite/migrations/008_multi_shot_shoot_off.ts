// SPDX-License-Identifier: MIT
import type { Migration } from './Migration';

export const migration008: Migration = {
  version: 8,
  name: 'multi_shot_shoot_off',
  up(db) {
    db.exec(`
      ALTER TABLE competition_shoot_off_shot_outbox RENAME TO competition_shoot_off_shot_outbox_v7;

      CREATE TABLE competition_shoot_off_shot_outbox (
        shot_id TEXT PRIMARY KEY,
        competition_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        iteration INTEGER NOT NULL CHECK(iteration > 0),
        lane_id TEXT NOT NULL,
        payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
        created_at TEXT NOT NULL,
        published_at TEXT
      );

      INSERT INTO competition_shoot_off_shot_outbox
      SELECT * FROM competition_shoot_off_shot_outbox_v7;

      DROP TABLE competition_shoot_off_shot_outbox_v7;

      CREATE INDEX idx_competition_shoot_off_shot_pending
        ON competition_shoot_off_shot_outbox(published_at, created_at, shot_id);
      CREATE INDEX idx_competition_shoot_off_shot_round
        ON competition_shoot_off_shot_outbox(run_id, iteration, lane_id, created_at, shot_id);
    `);
  },
};
