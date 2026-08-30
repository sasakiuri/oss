import type { Migration } from './Migration';

export const migration018FiringWindowReview: Migration = {
  version: 18,
  name: 'firing_window_review',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS mqtt_firing_command_boundaries (
        id TEXT PRIMARY KEY,
        competition_id TEXT NOT NULL,
        phase TEXT NOT NULL CHECK (phase IN ('SIGHTING', 'MATCH')),
        transition TEXT NOT NULL CHECK (transition IN ('OPEN', 'CLOSE')),
        occurred_at TEXT NOT NULL,
        command_id TEXT NOT NULL,
        command_issued_at TEXT NOT NULL,
        source_action TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        UNIQUE (competition_id, command_id, phase, transition)
      );

      CREATE INDEX IF NOT EXISTS idx_mqtt_firing_boundaries_competition
        ON mqtt_firing_command_boundaries(competition_id, occurred_at, id);

      CREATE TABLE IF NOT EXISTS mqtt_firing_window_violations (
        id TEXT PRIMARY KEY,
        competition_id TEXT NOT NULL,
        lane_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        shot_id TEXT NOT NULL,
        observation_id TEXT NOT NULL,
        shot_mode TEXT NOT NULL CHECK (shot_mode IN ('SIGHTING', 'MATCH')),
        policy_rule_id TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN (
          'BEFORE_PREPARATION_AND_SIGHTING_START',
          'BETWEEN_PREPARATION_AND_SIGHTING_STOP_AND_MATCH_START',
          'AFTER_MATCH_STOP'
        )),
        rule_reference TEXT NOT NULL,
        review_guidance TEXT NOT NULL,
        timestamp_source TEXT NOT NULL CHECK (timestamp_source IN ('FIRED_AT', 'RECEIVED_AT', 'OBSERVED_AT')),
        clock_tolerance_milliseconds INTEGER NOT NULL CHECK (clock_tolerance_milliseconds >= 0),
        evaluated_shot_at TEXT NOT NULL,
        fired_at TEXT NOT NULL,
        received_at TEXT NOT NULL,
        observed_at TEXT NOT NULL,
        decisive_boundary_id TEXT NOT NULL REFERENCES mqtt_firing_command_boundaries(id),
        detected_at TEXT NOT NULL,
        UNIQUE (competition_id, lane_id, session_id, shot_id, policy_rule_id)
      );

      CREATE INDEX IF NOT EXISTS idx_mqtt_firing_violations_competition
        ON mqtt_firing_window_violations(competition_id, evaluated_shot_at, id);

      CREATE TRIGGER IF NOT EXISTS trg_mqtt_firing_boundaries_no_update
      BEFORE UPDATE ON mqtt_firing_command_boundaries
      BEGIN
        SELECT RAISE(ABORT, 'Firing command boundaries are append-only');
      END;

      CREATE TRIGGER IF NOT EXISTS trg_mqtt_firing_boundaries_no_delete
      BEFORE DELETE ON mqtt_firing_command_boundaries
      BEGIN
        SELECT RAISE(ABORT, 'Firing command boundaries are append-only');
      END;

      CREATE TRIGGER IF NOT EXISTS trg_mqtt_firing_violations_no_update
      BEFORE UPDATE ON mqtt_firing_window_violations
      BEGIN
        SELECT RAISE(ABORT, 'Firing-window violations are append-only');
      END;

      CREATE TRIGGER IF NOT EXISTS trg_mqtt_firing_violations_no_delete
      BEFORE DELETE ON mqtt_firing_window_violations
      BEGIN
        SELECT RAISE(ABORT, 'Firing-window violations are append-only');
      END;
    `);
  },
};
