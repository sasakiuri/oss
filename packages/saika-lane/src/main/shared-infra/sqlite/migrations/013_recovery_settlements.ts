// SPDX-License-Identifier: MIT
import type { Migration } from './Migration';

export const migration013: Migration = {
  version: 13,
  name: 'recovery_settlements',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS qualification_recovery_settlements (
        id TEXT PRIMARY KEY,
        decision_id TEXT NOT NULL UNIQUE,
        competition_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        interruption_id TEXT NOT NULL,
        treatment TEXT NOT NULL CHECK(treatment = 'KEEP_RECORDED_SERIES'),
        stage_index INTEGER NOT NULL CHECK(stage_index >= 0),
        series_index INTEGER NOT NULL CHECK(series_index >= 0),
        session_series_number INTEGER NOT NULL CHECK(session_series_number > 0),
        expected_match_program_id TEXT NOT NULL,
        expected_series_shot_limit INTEGER NOT NULL CHECK(expected_series_shot_limit > 0),
        expected_recorded_shots INTEGER NOT NULL CHECK(expected_recorded_shots = expected_series_shot_limit),
        decision_official_name TEXT NOT NULL,
        decision_rule_reference TEXT NOT NULL,
        decided_at TEXT NOT NULL,
        applied_by TEXT NOT NULL,
        statement TEXT NOT NULL,
        applied_at TEXT NOT NULL,
        recorded_shots_json TEXT NOT NULL CHECK(json_valid(recorded_shots_json))
      );

      CREATE INDEX IF NOT EXISTS idx_qualification_recovery_settlements_competition
        ON qualification_recovery_settlements(competition_id, applied_at, id);

      CREATE TRIGGER IF NOT EXISTS trg_qualification_recovery_settlements_no_update
      BEFORE UPDATE ON qualification_recovery_settlements
      BEGIN
        SELECT RAISE(ABORT, 'Qualification recovery settlements are immutable');
      END;

      CREATE TRIGGER IF NOT EXISTS trg_qualification_recovery_settlements_no_delete
      BEFORE DELETE ON qualification_recovery_settlements
      BEGIN
        SELECT RAISE(ABORT, 'Qualification recovery settlements are immutable');
      END;
    `);
  },
};
