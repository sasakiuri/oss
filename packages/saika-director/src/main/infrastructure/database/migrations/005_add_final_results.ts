import type { Migration } from './Migration';

export const migration005AddFinalResults: Migration = {
  version: 5,
  name: 'add_final_results',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS final_results (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL,
        participant_id TEXT NOT NULL,
        player_name TEXT NOT NULL,
        affiliation TEXT NOT NULL,
        firing_point_number INTEGER NOT NULL,
        stage1_shots TEXT NOT NULL,
        stage1_total REAL NOT NULL,
        stage2_shots TEXT NOT NULL,
        stage2_total REAL NOT NULL,
        total_score REAL NOT NULL,
        final_rank INTEGER NOT NULL,
        eliminated_at_shot INTEGER,
        shootoff_id TEXT,
        remarks TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'in_progress',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
        FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE,
        FOREIGN KEY (event_id, participant_id) REFERENCES participants(event_id, id)
      );

      CREATE INDEX IF NOT EXISTS idx_results_event_total
        ON results(event_id, total_score DESC);

      CREATE INDEX IF NOT EXISTS idx_final_results_event_rank
        ON final_results(event_id, final_rank ASC);
    `);
  },
};
