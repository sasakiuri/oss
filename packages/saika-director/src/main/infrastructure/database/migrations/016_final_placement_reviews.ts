import type { Migration } from './Migration';

export const migration016FinalPlacementReviews: Migration = {
  version: 16,
  name: 'final_placement_reviews',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS final_placement_review_entries (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
        entry_type TEXT NOT NULL CHECK (entry_type IN ('REVIEW', 'REVOCATION')),
        scoring_revision TEXT NOT NULL,
        placements_json TEXT NOT NULL,
        rule_reference TEXT NOT NULL,
        statement TEXT NOT NULL,
        official_name TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        reverses_review_id TEXT REFERENCES final_placement_review_entries(id)
      );

      CREATE INDEX IF NOT EXISTS idx_final_placement_review_entries_event
        ON final_placement_review_entries(event_id, recorded_at, id);
      CREATE UNIQUE INDEX IF NOT EXISTS uq_final_placement_review_single_revocation
        ON final_placement_review_entries(reverses_review_id)
        WHERE reverses_review_id IS NOT NULL;
    `);
  },
};
