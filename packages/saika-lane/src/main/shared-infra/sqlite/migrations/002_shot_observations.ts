// SPDX-License-Identifier: MIT
import type { Migration } from './Migration';

export const migration002: Migration = {
  version: 2,
  name: 'shot_observations',
  up(db) {
    const shotColumns = db.prepare('PRAGMA table_info(shots)').all() as { name: string }[];
    const columnNames = new Set(shotColumns.map((column) => column.name));
    if (!columnNames.has('calculatedScore')) {
      db.exec('ALTER TABLE shots ADD COLUMN calculatedScore INTEGER');
    }
    if (!columnNames.has('receivedAt')) {
      db.exec('ALTER TABLE shots ADD COLUMN receivedAt TEXT');
    }
    if (!columnNames.has('observationId')) {
      db.exec('ALTER TABLE shots ADD COLUMN observationId TEXT');
    }

    db.exec(`
      CREATE TABLE IF NOT EXISTS shot_observations (
        id TEXT PRIMARY KEY,
        x REAL,
        y REAL,
        device_score_x10 REAL,
        fired_at TEXT NOT NULL,
        received_at TEXT NOT NULL,
        reported_mode TEXT CHECK(reported_mode IN ('SIGHTING', 'MATCH') OR reported_mode IS NULL),
        raw_frame_hex TEXT
      );

      CREATE TABLE IF NOT EXISTS shot_observation_outcomes (
        id TEXT PRIMARY KEY,
        observation_id TEXT NOT NULL REFERENCES shot_observations(id) ON DELETE CASCADE,
        outcome_type TEXT NOT NULL,
        decided_at TEXT NOT NULL,
        session_id TEXT,
        detail TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_shot_observation_outcomes_observation
        ON shot_observation_outcomes(observation_id, decided_at);
      CREATE INDEX IF NOT EXISTS idx_shots_observation ON shots(observationId);
    `);
  },
};
