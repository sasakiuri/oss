import type { Migration } from './Migration';

/** Preserves the Lane target face and independent scoring-gauge identity per MQTT delivery. */
export const migration052ScoringGeometryEvidence: Migration = {
  version: 52,
  name: 'scoring_geometry_evidence',
  up(db) {
    const columns = db.prepare('PRAGMA table_info(mqtt_competition_shot_observations)').all() as {
      name: string;
    }[];
    const names = new Set(columns.map((column) => column.name));
    if (!names.has('target_profile_id')) {
      db.exec('ALTER TABLE mqtt_competition_shot_observations ADD COLUMN target_profile_id TEXT');
    }
    if (!names.has('scoring_gauge_profile_id')) {
      db.exec('ALTER TABLE mqtt_competition_shot_observations ADD COLUMN scoring_gauge_profile_id TEXT');
    }
  },
};
