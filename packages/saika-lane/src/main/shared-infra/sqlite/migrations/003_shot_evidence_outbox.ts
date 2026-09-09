// SPDX-License-Identifier: MIT
import type { Migration } from './Migration';

export const migration003: Migration = {
  version: 3,
  name: 'shot_evidence_outbox',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS shot_observation_evidence_outbox (
        evidence_id TEXT PRIMARY KEY,
        observation_id TEXT NOT NULL REFERENCES shot_observations(id),
        outcome_id TEXT NOT NULL REFERENCES shot_observation_outcomes(id),
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        published_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_shot_observation_evidence_pending
        ON shot_observation_evidence_outbox(published_at, created_at, evidence_id);
    `);
  },
};
