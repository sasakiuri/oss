import type { Migration } from './Migration';

export const migration036FinalOperations: Migration = {
  version: 36,
  name: 'final_operations',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS final_operation_runs (
        id TEXT PRIMARY KEY,
        competition_id TEXT NOT NULL,
        event_id TEXT,
        competition_type_id TEXT NOT NULL,
        rule_pack_id TEXT NOT NULL,
        script_version TEXT NOT NULL,
        script_snapshot_json TEXT NOT NULL CHECK (json_valid(script_snapshot_json)),
        scheduled_start_at TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_final_operation_runs_competition
        ON final_operation_runs(competition_id, created_at, id);

      CREATE TABLE IF NOT EXISTS final_operation_entries (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES final_operation_runs(id),
        entry_type TEXT NOT NULL CHECK (entry_type IN (
          'STEP_CONFIRMED',
          'STEP_SKIPPED',
          'EXECUTION_RESULT',
          'SHOOT_OFF_STARTED',
          'SHOOT_OFF_ROUND_CLOSED',
          'ABORTED'
        )),
        branch TEXT NOT NULL CHECK (branch IN ('MAIN', 'SHOOT_OFF')),
        iteration INTEGER NOT NULL CHECK (iteration >= 0),
        step_id TEXT,
        step_snapshot_json TEXT CHECK (step_snapshot_json IS NULL OR json_valid(step_snapshot_json)),
        confirmation_entry_id TEXT REFERENCES final_operation_entries(id),
        execution_status TEXT CHECK (execution_status IS NULL OR execution_status IN ('DONE', 'ERROR', 'TIMEOUT')),
        command_id TEXT,
        eligible_lane_ids_json TEXT NOT NULL CHECK (json_valid(eligible_lane_ids_json)),
        statement TEXT NOT NULL,
        official_name TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        metadata_json TEXT CHECK (metadata_json IS NULL OR json_valid(metadata_json)),
        CHECK (
          (entry_type = 'STEP_CONFIRMED' AND step_id IS NOT NULL AND step_snapshot_json IS NOT NULL
            AND confirmation_entry_id IS NULL AND execution_status IS NULL)
          OR (entry_type = 'STEP_SKIPPED' AND step_id IS NOT NULL AND step_snapshot_json IS NOT NULL
            AND confirmation_entry_id IS NULL AND execution_status IS NULL)
          OR (entry_type = 'EXECUTION_RESULT' AND step_id IS NOT NULL AND step_snapshot_json IS NOT NULL
            AND confirmation_entry_id IS NOT NULL AND execution_status IS NOT NULL)
          OR (entry_type IN ('SHOOT_OFF_STARTED', 'SHOOT_OFF_ROUND_CLOSED')
            AND step_id IS NOT NULL AND step_snapshot_json IS NOT NULL
            AND confirmation_entry_id IS NULL AND execution_status IS NULL)
          OR (entry_type = 'ABORTED' AND step_id IS NULL AND step_snapshot_json IS NULL
            AND confirmation_entry_id IS NULL AND execution_status IS NULL)
        )
      );

      CREATE INDEX IF NOT EXISTS idx_final_operation_entries_run
        ON final_operation_entries(run_id, recorded_at, id);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_final_operation_entries_confirm_once
        ON final_operation_entries(run_id, branch, iteration, step_id)
        WHERE entry_type = 'STEP_CONFIRMED';

      CREATE UNIQUE INDEX IF NOT EXISTS idx_final_operation_entries_skip_once
        ON final_operation_entries(run_id, branch, iteration, step_id)
        WHERE entry_type = 'STEP_SKIPPED';

      CREATE UNIQUE INDEX IF NOT EXISTS idx_final_operation_entries_shoot_off_start_once
        ON final_operation_entries(run_id, branch, iteration)
        WHERE entry_type = 'SHOOT_OFF_STARTED';

      CREATE UNIQUE INDEX IF NOT EXISTS idx_final_operation_entries_shoot_off_close_once
        ON final_operation_entries(run_id, branch, iteration)
        WHERE entry_type = 'SHOOT_OFF_ROUND_CLOSED';

      CREATE TABLE IF NOT EXISTS final_operation_shoot_off_shots (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES final_operation_runs(id),
        iteration INTEGER NOT NULL CHECK (iteration > 0),
        lane_id TEXT NOT NULL,
        shot_id TEXT NOT NULL UNIQUE,
        score_x10 INTEGER NOT NULL CHECK (score_x10 BETWEEN 0 AND 109),
        x REAL,
        y REAL,
        fired_at TEXT NOT NULL,
        observed_at TEXT NOT NULL,
        UNIQUE (run_id, iteration, lane_id)
      );

      CREATE INDEX IF NOT EXISTS idx_final_operation_shoot_off_shots_run
        ON final_operation_shoot_off_shots(run_id, iteration, observed_at, id);

      CREATE TRIGGER IF NOT EXISTS trg_final_operation_runs_no_update
      BEFORE UPDATE ON final_operation_runs
      BEGIN SELECT RAISE(ABORT, 'Final operation runs are append-only'); END;

      CREATE TRIGGER IF NOT EXISTS trg_final_operation_runs_no_delete
      BEFORE DELETE ON final_operation_runs
      BEGIN SELECT RAISE(ABORT, 'Final operation runs are append-only'); END;

      CREATE TRIGGER IF NOT EXISTS trg_final_operation_entries_no_update
      BEFORE UPDATE ON final_operation_entries
      BEGIN SELECT RAISE(ABORT, 'Final operation entries are append-only'); END;

      CREATE TRIGGER IF NOT EXISTS trg_final_operation_entries_no_delete
      BEFORE DELETE ON final_operation_entries
      BEGIN SELECT RAISE(ABORT, 'Final operation entries are append-only'); END;

      CREATE TRIGGER IF NOT EXISTS trg_final_operation_shoot_off_shots_no_update
      BEFORE UPDATE ON final_operation_shoot_off_shots
      BEGIN SELECT RAISE(ABORT, 'Final operation shoot-off shots are append-only'); END;

      CREATE TRIGGER IF NOT EXISTS trg_final_operation_shoot_off_shots_no_delete
      BEFORE DELETE ON final_operation_shoot_off_shots
      BEGIN SELECT RAISE(ABORT, 'Final operation shoot-off shots are append-only'); END;
    `);
  },
};
