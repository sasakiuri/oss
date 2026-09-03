import type { Migration } from './Migration';

/**
 * Immutable bindings and append-only observations for executing an official
 * Qualification recovery decision. These rows never alter the scored series.
 */
export const migration055QualificationRecoveryExecutionEvents: Migration = {
  version: 55,
  name: 'qualification_recovery_execution_events',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS qualification_recovery_executions (
        run_id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL REFERENCES range_interruption_cases(id),
        decision_id TEXT NOT NULL REFERENCES qualification_timed_target_recovery_decisions(id),
        competition_id TEXT NOT NULL,
        lane_id TEXT NOT NULL,
        phase TEXT NOT NULL CHECK (phase IN ('EXTRA_SIGHTING', 'SERIES_RECOVERY')),
        stage_index INTEGER NOT NULL CHECK (stage_index >= 0),
        series_index INTEGER NOT NULL CHECK (series_index >= 0),
        expected_match_program_id TEXT NOT NULL,
        expected_series_shot_limit INTEGER NOT NULL CHECK (expected_series_shot_limit > 0),
        expected_recorded_shots INTEGER NOT NULL CHECK (expected_recorded_shots >= 0),
        authorization_json TEXT NOT NULL,
        official_name TEXT NOT NULL,
        decision_rule_reference TEXT NOT NULL,
        decided_at TEXT NOT NULL,
        requested_at TEXT NOT NULL,
        UNIQUE(decision_id, phase)
      );

      CREATE INDEX IF NOT EXISTS idx_qualification_recovery_executions_case
        ON qualification_recovery_executions(case_id, requested_at);

      CREATE TRIGGER IF NOT EXISTS trg_qualification_recovery_executions_decision_case
      BEFORE INSERT ON qualification_recovery_executions
      WHEN NOT EXISTS (
        SELECT 1
        FROM qualification_timed_target_recovery_decisions
        WHERE id = NEW.decision_id AND case_id = NEW.case_id
      )
      BEGIN
        SELECT RAISE(ABORT, 'Qualification recovery decision does not belong to interruption case');
      END;

      CREATE TABLE IF NOT EXISTS qualification_recovery_execution_events (
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
          'CANCEL_ERROR'
        )),
        payload_json TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        recorded_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_qualification_recovery_execution_events_run
        ON qualification_recovery_execution_events(run_id, recorded_at);

      CREATE TRIGGER IF NOT EXISTS trg_qualification_recovery_executions_no_update
      BEFORE UPDATE ON qualification_recovery_executions
      BEGIN
        SELECT RAISE(ABORT, 'Qualification recovery executions are immutable');
      END;

      CREATE TRIGGER IF NOT EXISTS trg_qualification_recovery_executions_no_delete
      BEFORE DELETE ON qualification_recovery_executions
      BEGIN
        SELECT RAISE(ABORT, 'Qualification recovery executions are append-only');
      END;

      CREATE TRIGGER IF NOT EXISTS trg_qualification_recovery_execution_events_no_update
      BEFORE UPDATE ON qualification_recovery_execution_events
      BEGIN
        SELECT RAISE(ABORT, 'Qualification recovery execution events are append-only');
      END;

      CREATE TRIGGER IF NOT EXISTS trg_qualification_recovery_execution_events_no_delete
      BEFORE DELETE ON qualification_recovery_execution_events
      BEGIN
        SELECT RAISE(ABORT, 'Qualification recovery execution events are append-only');
      END;
    `);
  },
};
