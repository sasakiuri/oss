import type { Migration } from './Migration';

export const migration030MixedTeamFinalResults: Migration = {
  version: 30,
  name: 'mixed_team_final_results',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS mixed_team_final_results (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL,
        source_competition_id TEXT NOT NULL,
        team_id TEXT NOT NULL,
        team_name TEXT NOT NULL,
        nation_code TEXT NOT NULL,
        member_results_json TEXT NOT NULL CHECK (json_valid(member_results_json)),
        stage1_total REAL NOT NULL,
        stage2_total REAL NOT NULL,
        total_score REAL NOT NULL,
        final_rank INTEGER NOT NULL CHECK (final_rank BETWEEN 1 AND 4),
        eliminated_at_shot INTEGER,
        shootoff_id TEXT,
        remarks TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(event_id, team_id)
      );
      CREATE INDEX IF NOT EXISTS idx_mixed_team_final_results_event
        ON mixed_team_final_results(event_id, final_rank, team_id);
    `);
  },
};
