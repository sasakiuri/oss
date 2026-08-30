import type { Migration } from './Migration';

export const migration028FinalControl: Migration = {
  version: 28,
  name: 'final_control',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS final_control_decisions (
        id TEXT PRIMARY KEY,
        competition_id TEXT NOT NULL,
        event_id TEXT,
        competition_type_id TEXT NOT NULL,
        participant_count INTEGER NOT NULL CHECK (participant_count >= 2),
        after_shot INTEGER NOT NULL CHECK (after_shot > 0),
        rank INTEGER NOT NULL CHECK (rank >= 2),
        selected_lane_id TEXT NOT NULL,
        score_snapshot_json TEXT NOT NULL CHECK (json_valid(score_snapshot_json)),
        tied_lane_ids_json TEXT NOT NULL CHECK (json_valid(tied_lane_ids_json)),
        resolution TEXT NOT NULL CHECK (resolution IN ('CLEAR_LOWEST', 'SHOOT_OFF', 'JURY_DECISION')),
        resolution_statement TEXT,
        official_name TEXT NOT NULL,
        rule_reference TEXT NOT NULL,
        recorded_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_final_control_decisions_competition
        ON final_control_decisions(competition_id, after_shot, rank, recorded_at, id);

      CREATE TABLE IF NOT EXISTS final_control_entries (
        id TEXT PRIMARY KEY,
        decision_id TEXT NOT NULL REFERENCES final_control_decisions(id),
        entry_type TEXT NOT NULL CHECK (entry_type IN ('COMMAND_RESULT', 'VOID')),
        command_id TEXT,
        command_status TEXT CHECK (command_status IS NULL OR command_status IN ('DONE', 'ERROR', 'TIMEOUT')),
        statement TEXT NOT NULL,
        official_name TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        CHECK (
          (entry_type = 'COMMAND_RESULT' AND command_id IS NOT NULL AND command_status IS NOT NULL)
          OR (entry_type = 'VOID' AND command_id IS NULL AND command_status IS NULL)
        )
      );

      CREATE INDEX IF NOT EXISTS idx_final_control_entries_decision
        ON final_control_entries(decision_id, recorded_at, id);

      CREATE TRIGGER IF NOT EXISTS trg_final_control_decisions_no_update
      BEFORE UPDATE ON final_control_decisions
      BEGIN SELECT RAISE(ABORT, 'Final control decisions are append-only'); END;
      CREATE TRIGGER IF NOT EXISTS trg_final_control_decisions_no_delete
      BEFORE DELETE ON final_control_decisions
      BEGIN SELECT RAISE(ABORT, 'Final control decisions are append-only'); END;
      CREATE TRIGGER IF NOT EXISTS trg_final_control_entries_no_update
      BEFORE UPDATE ON final_control_entries
      BEGIN SELECT RAISE(ABORT, 'Final control entries are append-only'); END;
      CREATE TRIGGER IF NOT EXISTS trg_final_control_entries_no_delete
      BEFORE DELETE ON final_control_entries
      BEGIN SELECT RAISE(ABORT, 'Final control entries are append-only'); END;
    `);
  },
};
