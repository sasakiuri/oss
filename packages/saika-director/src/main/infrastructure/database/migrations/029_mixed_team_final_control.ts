import type { Migration } from './Migration';

export const migration029MixedTeamFinalControl: Migration = {
  version: 29,
  name: 'mixed_team_final_control',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS mixed_team_final_decisions (
        id TEXT PRIMARY KEY,
        competition_id TEXT NOT NULL,
        event_id TEXT,
        competition_type_id TEXT NOT NULL,
        after_shot INTEGER NOT NULL CHECK (after_shot > 0),
        rank INTEGER NOT NULL CHECK (rank BETWEEN 2 AND 4),
        selected_team_id TEXT NOT NULL,
        member_lane_ids_json TEXT NOT NULL CHECK (json_valid(member_lane_ids_json)),
        score_snapshot_json TEXT NOT NULL CHECK (json_valid(score_snapshot_json)),
        tied_team_ids_json TEXT NOT NULL CHECK (json_valid(tied_team_ids_json)),
        resolution TEXT NOT NULL CHECK (resolution IN ('CLEAR_LOWEST', 'SHOOT_OFF', 'JURY_DECISION')),
        resolution_statement TEXT,
        official_name TEXT NOT NULL,
        rule_reference TEXT NOT NULL,
        recorded_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_mixed_team_final_decisions_competition
        ON mixed_team_final_decisions(competition_id, after_shot, rank, recorded_at, id);

      CREATE TABLE IF NOT EXISTS mixed_team_final_entries (
        id TEXT PRIMARY KEY,
        decision_id TEXT NOT NULL REFERENCES mixed_team_final_decisions(id),
        entry_type TEXT NOT NULL CHECK (entry_type IN ('COMMAND_BATCH', 'VOID')),
        command_results_json TEXT CHECK (command_results_json IS NULL OR json_valid(command_results_json)),
        statement TEXT NOT NULL,
        official_name TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        CHECK (
          (entry_type = 'COMMAND_BATCH' AND command_results_json IS NOT NULL)
          OR (entry_type = 'VOID' AND command_results_json IS NULL)
        )
      );
      CREATE INDEX IF NOT EXISTS idx_mixed_team_final_entries_decision
        ON mixed_team_final_entries(decision_id, recorded_at, id);

      CREATE TRIGGER IF NOT EXISTS trg_mixed_team_final_decisions_no_update
      BEFORE UPDATE ON mixed_team_final_decisions
      BEGIN SELECT RAISE(ABORT, 'Mixed Team Final decisions are append-only'); END;
      CREATE TRIGGER IF NOT EXISTS trg_mixed_team_final_decisions_no_delete
      BEFORE DELETE ON mixed_team_final_decisions
      BEGIN SELECT RAISE(ABORT, 'Mixed Team Final decisions are append-only'); END;
      CREATE TRIGGER IF NOT EXISTS trg_mixed_team_final_entries_no_update
      BEFORE UPDATE ON mixed_team_final_entries
      BEGIN SELECT RAISE(ABORT, 'Mixed Team Final entries are append-only'); END;
      CREATE TRIGGER IF NOT EXISTS trg_mixed_team_final_entries_no_delete
      BEFORE DELETE ON mixed_team_final_entries
      BEGIN SELECT RAISE(ABORT, 'Mixed Team Final entries are append-only'); END;
    `);
  },
};
