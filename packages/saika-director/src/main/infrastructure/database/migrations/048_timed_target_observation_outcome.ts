import type { Migration } from './Migration';

/** Adds a distinct, auditable outcome for locally enforced ISSF timed-target windows. */
export const migration048TimedTargetObservationOutcome: Migration = {
  version: 48,
  name: 'timed_target_observation_outcome',
  up(db) {
    db.exec(`
      DROP TRIGGER IF EXISTS trg_mqtt_observation_evidence_no_update;
      DROP TRIGGER IF EXISTS trg_mqtt_observation_evidence_no_delete;

      ALTER TABLE mqtt_shot_observation_evidence RENAME TO mqtt_shot_observation_evidence_v47;

      CREATE TABLE mqtt_shot_observation_evidence (
        evidence_id TEXT PRIMARY KEY,
        observation_id TEXT NOT NULL,
        competition_id TEXT,
        lane_id TEXT NOT NULL,
        outcome TEXT NOT NULL CHECK (outcome IN (
          'RECORDED',
          'REJECTED_COMPETITION_PHASE',
          'REJECTED_TIMED_TARGET_WINDOW',
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
      SELECT * FROM mqtt_shot_observation_evidence_v47;

      DROP TABLE mqtt_shot_observation_evidence_v47;

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
