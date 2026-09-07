// SPDX-License-Identifier: MIT
import type { Migration } from './Migration';

export const migration069ScoreCorrections: Migration = {
  version: 69,
  name: 'score_corrections',
  up(db) {
    db.exec(`CREATE TABLE score_corrections (
      id TEXT PRIMARY KEY, event_id TEXT NOT NULL, participant_id TEXT NOT NULL,
      relay_number INTEGER NOT NULL CHECK (relay_number > 0), result_scope TEXT NOT NULL CHECK (result_scope IN ('QUALIFICATION', 'FINAL')),
      snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json))
    );
    CREATE INDEX score_corrections_target ON score_corrections(event_id, participant_id, relay_number, result_scope);
    CREATE TABLE score_correction_withdrawals (
      id TEXT PRIMARY KEY, application_id TEXT UNIQUE NOT NULL REFERENCES score_corrections(id),
      snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json))
    );`);
    for (const table of ['score_corrections', 'score_correction_withdrawals'])
      db.exec(`
      CREATE TRIGGER ${table}_no_update BEFORE UPDATE ON ${table} BEGIN SELECT RAISE(ABORT, 'Score correction history is append-only'); END;
      CREATE TRIGGER ${table}_no_delete BEFORE DELETE ON ${table} BEGIN SELECT RAISE(ABORT, 'Score correction history is append-only'); END;
    `);
  },
};
