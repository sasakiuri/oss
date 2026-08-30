import type { Migration } from './Migration';

export const migration022ShotObservationEvidence: Migration = {
  version: 22,
  name: 'shot_observation_evidence',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS mqtt_shot_observation_evidence (
        evidence_id TEXT PRIMARY KEY,
        observation_id TEXT NOT NULL,
        competition_id TEXT,
        lane_id TEXT NOT NULL,
        outcome TEXT NOT NULL CHECK (outcome IN (
          'RECORDED',
          'REJECTED_COMPETITION_PHASE',
          'NO_ACTIVE_SESSION',
          'PROCESSING_FAILED'
        )),
        fired_at TEXT NOT NULL,
        received_at TEXT NOT NULL,
        observed_at TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_mqtt_observation_evidence_competition
        ON mqtt_shot_observation_evidence(competition_id, observed_at, evidence_id);
      CREATE INDEX IF NOT EXISTS idx_mqtt_observation_evidence_lane
        ON mqtt_shot_observation_evidence(lane_id, observed_at, evidence_id);

      CREATE TRIGGER IF NOT EXISTS trg_mqtt_observation_evidence_no_update
      BEFORE UPDATE ON mqtt_shot_observation_evidence
      BEGIN
        SELECT RAISE(ABORT, 'Shot observation evidence is append-only');
      END;

      CREATE TRIGGER IF NOT EXISTS trg_mqtt_observation_evidence_no_delete
      BEFORE DELETE ON mqtt_shot_observation_evidence
      BEGIN
        SELECT RAISE(ABORT, 'Shot observation evidence is append-only');
      END;
    `);
  },
};
