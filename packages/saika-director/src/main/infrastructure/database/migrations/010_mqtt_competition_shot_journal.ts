import type { Migration } from './Migration';

export const migration010MqttCompetitionShotJournal: Migration = {
  version: 10,
  name: 'mqtt_competition_shot_journal',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS mqtt_competition_shot_observations (
        id TEXT PRIMARY KEY,
        competition_id TEXT NOT NULL,
        lane_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        shot_id TEXT NOT NULL,
        source_observation_id TEXT,
        x REAL,
        y REAL,
        legacy_raw_score_x10 INTEGER NOT NULL,
        device_score_x10 INTEGER,
        calculated_score_x10 INTEGER NOT NULL,
        calculated_score_available INTEGER NOT NULL DEFAULT 0
          CHECK (calculated_score_available IN (0, 1)),
        effective_score_x10 INTEGER NOT NULL,
        inner_ten INTEGER NOT NULL CHECK (inner_ten IN (0, 1)),
        mode TEXT NOT NULL CHECK (mode IN ('SIGHTING', 'MATCH')),
        fired_at TEXT NOT NULL,
        received_at TEXT NOT NULL,
        stage_index INTEGER NOT NULL,
        scored INTEGER NOT NULL CHECK (scored IN (0, 1)),
        series_index INTEGER NOT NULL,
        shot_number_in_series INTEGER NOT NULL,
        is_recorded INTEGER NOT NULL CHECK (is_recorded IN (0, 1)),
        is_replay INTEGER NOT NULL CHECK (is_replay IN (0, 1)),
        published_at TEXT NOT NULL,
        observed_at TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_mqtt_shot_observations_competition
        ON mqtt_competition_shot_observations(competition_id, observed_at, id);
      CREATE INDEX IF NOT EXISTS idx_mqtt_shot_observations_shot
        ON mqtt_competition_shot_observations(shot_id, observed_at, id);
    `);
  },
};
