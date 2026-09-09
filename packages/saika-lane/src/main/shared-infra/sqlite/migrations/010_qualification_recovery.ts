// SPDX-License-Identifier: MIT
import type { Migration } from './Migration';

export const migration010: Migration = {
  version: 10,
  name: 'qualification_recovery',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS qualification_recovery_run_events (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        competition_id TEXT NOT NULL,
        event_type TEXT NOT NULL CHECK(event_type IN (
          'STARTED', 'SHOT_RECORDED', 'COMPLETED', 'CANCELLED'
        )),
        start_json TEXT CHECK(start_json IS NULL OR json_valid(start_json)),
        shot_id TEXT,
        observation_id TEXT,
        reason TEXT,
        occurred_at TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        CHECK (
          (event_type = 'STARTED' AND start_json IS NOT NULL AND shot_id IS NULL AND reason IS NULL) OR
          (event_type = 'SHOT_RECORDED' AND start_json IS NULL AND shot_id IS NOT NULL AND reason IS NULL) OR
          (event_type IN ('COMPLETED', 'CANCELLED') AND start_json IS NULL AND shot_id IS NULL AND reason IS NOT NULL)
        )
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_qualification_recovery_run_started
        ON qualification_recovery_run_events(run_id) WHERE event_type = 'STARTED';
      CREATE UNIQUE INDEX IF NOT EXISTS idx_qualification_recovery_run_shot
        ON qualification_recovery_run_events(run_id, shot_id) WHERE event_type = 'SHOT_RECORDED';
      CREATE UNIQUE INDEX IF NOT EXISTS idx_qualification_recovery_run_terminal
        ON qualification_recovery_run_events(run_id) WHERE event_type IN ('COMPLETED', 'CANCELLED');
      CREATE INDEX IF NOT EXISTS idx_qualification_recovery_run_competition
        ON qualification_recovery_run_events(competition_id, recorded_at, run_id);

      CREATE TRIGGER IF NOT EXISTS trg_qualification_recovery_run_events_no_update
      BEFORE UPDATE ON qualification_recovery_run_events
      BEGIN
        SELECT RAISE(ABORT, 'Qualification recovery run events are append-only');
      END;

      CREATE TRIGGER IF NOT EXISTS trg_qualification_recovery_run_events_no_delete
      BEFORE DELETE ON qualification_recovery_run_events
      BEGIN
        SELECT RAISE(ABORT, 'Qualification recovery run events are append-only');
      END;
    `);
  },
};
