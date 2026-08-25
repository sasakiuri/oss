import type { Migration } from './Migration';

export const migration008UniqueFinalResults: Migration = {
  version: 8,
  name: 'unique_final_results',
  up(db) {
    // Keep the first row from any result set that was previously published
    // with a duplicate Lane or participant, then enforce the invariant.
    db.exec(`
      DELETE FROM final_results
      WHERE rowid NOT IN (
        SELECT MIN(rowid)
        FROM final_results
        GROUP BY event_id, participant_id
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_final_results_event_participant
        ON final_results(event_id, participant_id);
    `);
  },
};
