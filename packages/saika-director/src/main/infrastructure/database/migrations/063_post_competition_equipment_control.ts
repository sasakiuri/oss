import type { Migration } from './Migration';

/** Append-only ISSF 6.7.9 selection, notice, test and failure-confirmation evidence. */
export const migration063PostCompetitionEquipmentControl: Migration = {
  version: 63,
  name: 'post_competition_equipment_control',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS post_competition_equipment_checks (
        id TEXT PRIMARY KEY,
        championship_id TEXT NOT NULL,
        event_id TEXT NOT NULL,
        event_name TEXT NOT NULL,
        event_type TEXT NOT NULL,
        round_name TEXT NOT NULL,
        participant_id TEXT NOT NULL,
        athlete_name TEXT NOT NULL,
        start_number TEXT,
        gender TEXT NOT NULL,
        selection_basis TEXT NOT NULL CHECK (selection_basis IN (
          'RANDOM_DRAW', 'TARGETED_CREDIBLE_EVIDENCE',
          'QUALIFICATION_FINALIST_TOP_10', 'PISTOL_TRIGGER_RANDOM_DRAW'
        )),
        selection_statement TEXT NOT NULL,
        selected_by TEXT NOT NULL,
        selected_at TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        rule_references_json TEXT NOT NULL CHECK (
          json_valid(rule_references_json) AND json_array_length(rule_references_json) > 0
        )
      );

      CREATE INDEX IF NOT EXISTS idx_post_competition_equipment_checks_championship
        ON post_competition_equipment_checks(championship_id, selected_at, recorded_at, id);
      CREATE INDEX IF NOT EXISTS idx_post_competition_equipment_checks_subject
        ON post_competition_equipment_checks(event_id, participant_id, selection_basis);

      CREATE TABLE IF NOT EXISTS post_competition_equipment_check_entries (
        id TEXT PRIMARY KEY,
        check_id TEXT NOT NULL REFERENCES post_competition_equipment_checks(id),
        entry_type TEXT NOT NULL CHECK (entry_type IN (
          'NOTICE_ISSUED', 'TEST_RECORDED', 'FAILURE_CONFIRMED', 'CHECK_VOIDED'
        )),
        payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
        occurred_at TEXT NOT NULL,
        recorded_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_post_competition_equipment_check_entries_check
        ON post_competition_equipment_check_entries(check_id, occurred_at, recorded_at, id);

      CREATE TRIGGER IF NOT EXISTS trg_post_competition_equipment_checks_no_update
        BEFORE UPDATE ON post_competition_equipment_checks
      BEGIN SELECT RAISE(ABORT, 'post-competition equipment checks are append-only'); END;
      CREATE TRIGGER IF NOT EXISTS trg_post_competition_equipment_checks_no_delete
        BEFORE DELETE ON post_competition_equipment_checks
      BEGIN SELECT RAISE(ABORT, 'post-competition equipment checks are append-only'); END;
      CREATE TRIGGER IF NOT EXISTS trg_post_competition_equipment_entries_no_update
        BEFORE UPDATE ON post_competition_equipment_check_entries
      BEGIN SELECT RAISE(ABORT, 'post-competition equipment check entries are append-only'); END;
      CREATE TRIGGER IF NOT EXISTS trg_post_competition_equipment_entries_no_delete
        BEFORE DELETE ON post_competition_equipment_check_entries
      BEGIN SELECT RAISE(ABORT, 'post-competition equipment check entries are append-only'); END;
    `);
  },
};
