import type { Migration } from './Migration';

/** Allows 25m five-shot shoot-offs and preserves each shot's source score. */
export const migration050MultiShotFinalShootOff: Migration = {
  version: 50,
  name: 'multi_shot_final_shoot_off',
  up(db) {
    db.exec(`
      DROP TRIGGER IF EXISTS trg_final_operation_shoot_off_shots_no_update;
      DROP TRIGGER IF EXISTS trg_final_operation_shoot_off_shots_no_delete;
      DROP INDEX IF EXISTS idx_final_operation_shoot_off_shots_run;

      ALTER TABLE final_operation_shoot_off_shots RENAME TO final_operation_shoot_off_shots_v49;

      CREATE TABLE final_operation_shoot_off_shots (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES final_operation_runs(id),
        iteration INTEGER NOT NULL CHECK (iteration > 0),
        lane_id TEXT NOT NULL,
        shot_id TEXT NOT NULL UNIQUE,
        score_x10 INTEGER NOT NULL CHECK (score_x10 BETWEEN 0 AND 109),
        source_score_x10 INTEGER NOT NULL CHECK (source_score_x10 BETWEEN 0 AND 109),
        x REAL,
        y REAL,
        fired_at TEXT NOT NULL,
        observed_at TEXT NOT NULL
      );

      INSERT INTO final_operation_shoot_off_shots (
        id, run_id, iteration, lane_id, shot_id, score_x10, source_score_x10,
        x, y, fired_at, observed_at
      )
      SELECT id, run_id, iteration, lane_id, shot_id, score_x10, score_x10,
        x, y, fired_at, observed_at
      FROM final_operation_shoot_off_shots_v49;

      DROP TABLE final_operation_shoot_off_shots_v49;

      CREATE INDEX idx_final_operation_shoot_off_shots_run
        ON final_operation_shoot_off_shots(run_id, iteration, observed_at, id);
      CREATE INDEX idx_final_operation_shoot_off_shots_lane
        ON final_operation_shoot_off_shots(run_id, iteration, lane_id, fired_at, id);

      CREATE TRIGGER trg_final_operation_shoot_off_shots_no_update
      BEFORE UPDATE ON final_operation_shoot_off_shots
      BEGIN SELECT RAISE(ABORT, 'Final operation shoot-off shots are append-only'); END;

      CREATE TRIGGER trg_final_operation_shoot_off_shots_no_delete
      BEFORE DELETE ON final_operation_shoot_off_shots
      BEGIN SELECT RAISE(ABORT, 'Final operation shoot-off shots are append-only'); END;
    `);
  },
};
