import type { Migration } from './Migration';
export const migration079ObservationReviews: Migration = {
  version: 79,
  name: 'observation_reviews',
  up(db) {
    db.exec(`
      CREATE TABLE observation_reviews (
        id TEXT PRIMARY KEY, competition_id TEXT NOT NULL, subject_id TEXT NOT NULL, snapshot_json TEXT NOT NULL
      );
      CREATE INDEX idx_observation_reviews_competition ON observation_reviews(competition_id, subject_id);
      CREATE TRIGGER trg_observation_reviews_no_update BEFORE UPDATE ON observation_reviews
      BEGIN SELECT RAISE(ABORT, 'Observation reviews are append-only'); END;
      CREATE TRIGGER trg_observation_reviews_no_delete BEFORE DELETE ON observation_reviews
      BEGIN SELECT RAISE(ABORT, 'Observation reviews are append-only'); END;
    `);
  },
};
