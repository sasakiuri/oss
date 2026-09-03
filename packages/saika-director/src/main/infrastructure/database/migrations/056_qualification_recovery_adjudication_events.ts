import type { Migration } from './Migration';

/** Adds explicit, append-only score-adjudication outcomes to recovery runs. */
export const migration056QualificationRecoveryAdjudicationEvents: Migration = {
  version: 56,
  name: 'qualification_recovery_adjudication_events',
  up(db) {
    db.exec(`
      DROP TRIGGER IF EXISTS trg_qualification_recovery_execution_events_no_update;
      DROP TRIGGER IF EXISTS trg_qualification_recovery_execution_events_no_delete;

      ALTER TABLE qualification_recovery_execution_events
        RENAME TO qualification_recovery_execution_events_v55;

      CREATE TABLE qualification_recovery_execution_events (
        id TEXT PRIMARY KEY,
        event_key TEXT NOT NULL UNIQUE,
        run_id TEXT NOT NULL REFERENCES qualification_recovery_executions(run_id),
        event_type TEXT NOT NULL CHECK (event_type IN (
          'START_RESULT',
          'START_ERROR',
          'LANE_STATE',
          'LANE_STATE_REJECTED',
          'SHOT',
          'SHOT_REJECTED',
          'CANCEL_REQUESTED',
          'CANCEL_RESULT',
          'CANCEL_ERROR',
          'ADJUDICATION_REQUESTED',
          'ADJUDICATION_RESULT',
          'ADJUDICATION_ERROR'
        )),
        payload_json TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        recorded_at TEXT NOT NULL
      );

      INSERT INTO qualification_recovery_execution_events
      SELECT * FROM qualification_recovery_execution_events_v55;

      DROP TABLE qualification_recovery_execution_events_v55;

      CREATE INDEX idx_qualification_recovery_execution_events_run
        ON qualification_recovery_execution_events(run_id, recorded_at);

      CREATE TRIGGER trg_qualification_recovery_execution_events_no_update
      BEFORE UPDATE ON qualification_recovery_execution_events
      BEGIN
        SELECT RAISE(ABORT, 'Qualification recovery execution events are append-only');
      END;

      CREATE TRIGGER trg_qualification_recovery_execution_events_no_delete
      BEFORE DELETE ON qualification_recovery_execution_events
      BEGIN
        SELECT RAISE(ABORT, 'Qualification recovery execution events are append-only');
      END;
    `);
  },
};
