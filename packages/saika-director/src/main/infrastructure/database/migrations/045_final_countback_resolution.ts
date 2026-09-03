import type { Migration } from './Migration';

/** Adds an explicit audit value for the ISSF 50m Final two-athlete countback. */
export const migration045FinalCountbackResolution: Migration = {
  version: 45,
  name: 'final_countback_resolution',
  up(db) {
    db.exec(`
      DROP TRIGGER IF EXISTS trg_final_control_decisions_no_update;
      DROP TRIGGER IF EXISTS trg_final_control_decisions_no_delete;
      DROP TRIGGER IF EXISTS trg_final_control_entries_no_update;
      DROP TRIGGER IF EXISTS trg_final_control_entries_no_delete;
      DROP INDEX IF EXISTS idx_final_control_decisions_competition;
      DROP INDEX IF EXISTS idx_final_control_entries_decision;

      ALTER TABLE final_control_entries RENAME TO final_control_entries_v28;
      ALTER TABLE final_control_decisions RENAME TO final_control_decisions_v28;

      CREATE TABLE final_control_decisions (
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
        resolution TEXT NOT NULL CHECK (resolution IN ('CLEAR_LOWEST', 'COUNTBACK', 'SHOOT_OFF', 'JURY_DECISION')),
        resolution_statement TEXT,
        official_name TEXT NOT NULL,
        rule_reference TEXT NOT NULL,
        recorded_at TEXT NOT NULL
      );

      INSERT INTO final_control_decisions
      SELECT * FROM final_control_decisions_v28;

      CREATE TABLE final_control_entries (
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

      INSERT INTO final_control_entries
      SELECT * FROM final_control_entries_v28;

      DROP TABLE final_control_entries_v28;
      DROP TABLE final_control_decisions_v28;

      CREATE INDEX idx_final_control_decisions_competition
        ON final_control_decisions(competition_id, after_shot, rank, recorded_at, id);
      CREATE INDEX idx_final_control_entries_decision
        ON final_control_entries(decision_id, recorded_at, id);

      CREATE TRIGGER trg_final_control_decisions_no_update
      BEFORE UPDATE ON final_control_decisions
      BEGIN SELECT RAISE(ABORT, 'Final control decisions are append-only'); END;
      CREATE TRIGGER trg_final_control_decisions_no_delete
      BEFORE DELETE ON final_control_decisions
      BEGIN SELECT RAISE(ABORT, 'Final control decisions are append-only'); END;
      CREATE TRIGGER trg_final_control_entries_no_update
      BEFORE UPDATE ON final_control_entries
      BEGIN SELECT RAISE(ABORT, 'Final control entries are append-only'); END;
      CREATE TRIGGER trg_final_control_entries_no_delete
      BEFORE DELETE ON final_control_entries
      BEGIN SELECT RAISE(ABORT, 'Final control entries are append-only'); END;
    `);
  },
};
