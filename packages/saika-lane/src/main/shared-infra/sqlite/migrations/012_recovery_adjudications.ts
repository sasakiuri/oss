// SPDX-License-Identifier: MIT
import type { Migration } from './Migration';

export const migration012: Migration = {
  version: 12,
  name: 'recovery_adjudications',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS qualification_recovery_adjudications (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL UNIQUE,
        competition_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        decision_id TEXT NOT NULL,
        interruption_id TEXT NOT NULL,
        treatment TEXT NOT NULL CHECK(treatment IN (
          'ANNUL_AND_REPEAT', 'COMPLETE_REMAINING_SHOTS'
        )),
        stage_index INTEGER NOT NULL CHECK(stage_index >= 0),
        series_index INTEGER NOT NULL CHECK(series_index >= 0),
        session_series_number INTEGER NOT NULL CHECK(session_series_number > 0),
        expected_recorded_shots INTEGER NOT NULL CHECK(expected_recorded_shots >= 0),
        authorized_shots INTEGER NOT NULL CHECK(authorized_shots > 0),
        decision_official_name TEXT NOT NULL,
        decision_rule_reference TEXT NOT NULL,
        decided_at TEXT NOT NULL,
        applied_by TEXT NOT NULL,
        statement TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_qualification_recovery_adjudications_competition
        ON qualification_recovery_adjudications(competition_id, applied_at, id);

      CREATE TABLE IF NOT EXISTS qualification_recovery_adjudication_shots (
        adjudication_id TEXT NOT NULL REFERENCES qualification_recovery_adjudications(id),
        shot_id TEXT NOT NULL,
        disposition TEXT NOT NULL CHECK(disposition IN (
          'PRESERVED_ORIGINAL', 'ANNULLED_ORIGINAL', 'CREDITED_RECOVERY', 'CREDITED_MISS'
        )),
        shot_snapshot_json TEXT NOT NULL CHECK(json_valid(shot_snapshot_json)),
        PRIMARY KEY(adjudication_id, shot_id)
      );

      CREATE INDEX IF NOT EXISTS idx_qualification_recovery_adjudication_shots_projection
        ON qualification_recovery_adjudication_shots(shot_id, disposition);

      CREATE TRIGGER IF NOT EXISTS trg_qualification_recovery_adjudications_no_update
      BEFORE UPDATE ON qualification_recovery_adjudications
      BEGIN
        SELECT RAISE(ABORT, 'Qualification recovery adjudications are immutable');
      END;

      CREATE TRIGGER IF NOT EXISTS trg_qualification_recovery_adjudications_no_delete
      BEFORE DELETE ON qualification_recovery_adjudications
      BEGIN
        SELECT RAISE(ABORT, 'Qualification recovery adjudications are immutable');
      END;

      CREATE TRIGGER IF NOT EXISTS trg_qualification_recovery_adjudication_shots_no_update
      BEFORE UPDATE ON qualification_recovery_adjudication_shots
      BEGIN
        SELECT RAISE(ABORT, 'Qualification recovery adjudication shots are append-only');
      END;

      CREATE TRIGGER IF NOT EXISTS trg_qualification_recovery_adjudication_shots_no_delete
      BEFORE DELETE ON qualification_recovery_adjudication_shots
      BEGIN
        SELECT RAISE(ABORT, 'Qualification recovery adjudication shots are append-only');
      END;
    `);
  },
};
