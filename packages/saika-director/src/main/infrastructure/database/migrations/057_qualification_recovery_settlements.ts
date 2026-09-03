import type { Migration } from './Migration';

/** Journals no-fire retain-series applications separately from firing executions and score adjudications. */
export const migration057QualificationRecoverySettlements: Migration = {
  version: 57,
  name: 'qualification_recovery_settlements',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS qualification_recovery_settlement_requests (
        settlement_id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL REFERENCES range_interruption_cases(id),
        decision_id TEXT NOT NULL UNIQUE REFERENCES qualification_timed_target_recovery_decisions(id),
        competition_id TEXT NOT NULL,
        lane_id TEXT NOT NULL,
        treatment TEXT NOT NULL CHECK(treatment = 'KEEP_RECORDED_SERIES'),
        stage_index INTEGER NOT NULL CHECK(stage_index >= 0),
        series_index INTEGER NOT NULL CHECK(series_index >= 0),
        expected_match_program_id TEXT NOT NULL,
        expected_series_shot_limit INTEGER NOT NULL CHECK(expected_series_shot_limit > 0),
        expected_recorded_shots INTEGER NOT NULL CHECK(expected_recorded_shots = expected_series_shot_limit),
        decision_official_name TEXT NOT NULL,
        decision_rule_reference TEXT NOT NULL,
        decided_at TEXT NOT NULL,
        applied_by TEXT NOT NULL,
        statement TEXT NOT NULL,
        applied_at TEXT NOT NULL,
        requested_at TEXT NOT NULL
      );

      CREATE INDEX idx_qualification_recovery_settlement_requests_case
        ON qualification_recovery_settlement_requests(case_id, requested_at);

      CREATE TRIGGER trg_qualification_recovery_settlement_requests_decision_case
      BEFORE INSERT ON qualification_recovery_settlement_requests
      WHEN NOT EXISTS (
        SELECT 1 FROM qualification_timed_target_recovery_decisions
        WHERE id = NEW.decision_id AND case_id = NEW.case_id
      )
      BEGIN
        SELECT RAISE(ABORT, 'Qualification recovery settlement decision does not belong to interruption case');
      END;

      CREATE TABLE qualification_recovery_settlement_events (
        id TEXT PRIMARY KEY,
        event_key TEXT NOT NULL UNIQUE,
        settlement_id TEXT NOT NULL REFERENCES qualification_recovery_settlement_requests(settlement_id),
        event_type TEXT NOT NULL CHECK(event_type IN ('SETTLEMENT_RESULT', 'SETTLEMENT_ERROR')),
        payload_json TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        recorded_at TEXT NOT NULL
      );

      CREATE INDEX idx_qualification_recovery_settlement_events_request
        ON qualification_recovery_settlement_events(settlement_id, recorded_at);

      CREATE TRIGGER trg_qualification_recovery_settlement_requests_no_update
      BEFORE UPDATE ON qualification_recovery_settlement_requests
      BEGIN
        SELECT RAISE(ABORT, 'Qualification recovery settlement requests are immutable');
      END;

      CREATE TRIGGER trg_qualification_recovery_settlement_requests_no_delete
      BEFORE DELETE ON qualification_recovery_settlement_requests
      BEGIN
        SELECT RAISE(ABORT, 'Qualification recovery settlement requests are append-only');
      END;

      CREATE TRIGGER trg_qualification_recovery_settlement_events_no_update
      BEFORE UPDATE ON qualification_recovery_settlement_events
      BEGIN
        SELECT RAISE(ABORT, 'Qualification recovery settlement events are append-only');
      END;

      CREATE TRIGGER trg_qualification_recovery_settlement_events_no_delete
      BEFORE DELETE ON qualification_recovery_settlement_events
      BEGIN
        SELECT RAISE(ABORT, 'Qualification recovery settlement events are append-only');
      END;
    `);
  },
};
