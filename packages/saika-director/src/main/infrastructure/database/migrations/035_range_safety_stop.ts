import type { Migration } from './Migration';

export const migration035RangeSafetyStop: Migration = {
  version: 35,
  name: 'range_safety_stop',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS range_safety_stop_audit (
        id TEXT PRIMARY KEY,
        safety_stop_id TEXT NOT NULL,
        operation TEXT NOT NULL CHECK(operation IN ('ACTIVATE', 'CLEAR')),
        target_lane_ids_json TEXT NOT NULL CHECK(json_valid(target_lane_ids_json)),
        success INTEGER NOT NULL CHECK(success IN (0, 1)),
        reason TEXT NOT NULL,
        official_name TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        lane_outcomes_json TEXT NOT NULL CHECK(json_valid(lane_outcomes_json))
      );

      CREATE INDEX IF NOT EXISTS idx_range_safety_stop_audit_stop
        ON range_safety_stop_audit(safety_stop_id, recorded_at, id);

      CREATE TRIGGER IF NOT EXISTS trg_range_safety_stop_audit_no_update
      BEFORE UPDATE ON range_safety_stop_audit
      BEGIN
        SELECT RAISE(ABORT, 'Range safety stop audit is append-only');
      END;

      CREATE TRIGGER IF NOT EXISTS trg_range_safety_stop_audit_no_delete
      BEFORE DELETE ON range_safety_stop_audit
      BEGIN
        SELECT RAISE(ABORT, 'Range safety stop audit is append-only');
      END;

      DROP TRIGGER IF EXISTS trg_mqtt_observation_evidence_no_update;
      DROP TRIGGER IF EXISTS trg_mqtt_observation_evidence_no_delete;

      ALTER TABLE mqtt_shot_observation_evidence RENAME TO mqtt_shot_observation_evidence_v34;

      CREATE TABLE mqtt_shot_observation_evidence (
        evidence_id TEXT PRIMARY KEY,
        observation_id TEXT NOT NULL,
        competition_id TEXT,
        lane_id TEXT NOT NULL,
        outcome TEXT NOT NULL CHECK (outcome IN (
          'RECORDED',
          'REJECTED_COMPETITION_PHASE',
          'QUARANTINED_SAFETY_STOP',
          'NO_ACTIVE_SESSION',
          'PROCESSING_FAILED'
        )),
        fired_at TEXT NOT NULL,
        received_at TEXT NOT NULL,
        observed_at TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );

      INSERT INTO mqtt_shot_observation_evidence
      SELECT * FROM mqtt_shot_observation_evidence_v34;

      DROP TABLE mqtt_shot_observation_evidence_v34;

      CREATE INDEX idx_mqtt_observation_evidence_competition
        ON mqtt_shot_observation_evidence(competition_id, observed_at, evidence_id);
      CREATE INDEX idx_mqtt_observation_evidence_lane
        ON mqtt_shot_observation_evidence(lane_id, observed_at, evidence_id);

      CREATE TRIGGER trg_mqtt_observation_evidence_no_update
      BEFORE UPDATE ON mqtt_shot_observation_evidence
      BEGIN
        SELECT RAISE(ABORT, 'Shot observation evidence is append-only');
      END;

      CREATE TRIGGER trg_mqtt_observation_evidence_no_delete
      BEFORE DELETE ON mqtt_shot_observation_evidence
      BEGIN
        SELECT RAISE(ABORT, 'Shot observation evidence is append-only');
      END;
    `);
  },
};
