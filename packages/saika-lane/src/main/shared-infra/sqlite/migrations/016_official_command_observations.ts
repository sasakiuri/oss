// SPDX-License-Identifier: MIT
import type { Migration } from './Migration';

export const migration016: Migration = {
  version: 16,
  name: 'official_command_observations',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS official_command_observations (
        id TEXT PRIMARY KEY, sequence_id TEXT NOT NULL, competition_id TEXT NOT NULL, observation_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_official_command_sequence ON official_command_observations(sequence_id);
      CREATE TRIGGER IF NOT EXISTS trg_official_commands_no_update BEFORE UPDATE ON official_command_observations
        BEGIN SELECT RAISE(ABORT, 'Official command observations are append-only'); END;
      CREATE TRIGGER IF NOT EXISTS trg_official_commands_no_delete BEFORE DELETE ON official_command_observations
        BEGIN SELECT RAISE(ABORT, 'Official command observations are append-only'); END;

    `);
  },
};
