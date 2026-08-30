import type { Migration } from './Migration';

export const migration038FinalRecoveries: Migration = {
  version: 38,
  name: 'final_recoveries',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS final_recovery_cases (
        id TEXT PRIMARY KEY,
        competition_id TEXT NOT NULL,
        event_id TEXT,
        final_run_id TEXT,
        script_step_id TEXT,
        script_step_snapshot TEXT,
        procedure_profile TEXT NOT NULL CHECK (procedure_profile IN (
          'RIFLE_PISTOL_10M_50M', 'RIFLE_PISTOL_10M_50M_MIXED_TEAM',
          'PISTOL_25M_RAPID_FIRE', 'PISTOL_25M_WOMEN', 'GENERAL'
        )),
        incident_type TEXT NOT NULL CHECK (incident_type IN (
          'MALFUNCTION', 'EST_FAILURE', 'INCORRECT_COMMAND', 'IRREGULAR_CASE'
        )),
        phase TEXT NOT NULL CHECK (phase IN ('SIGHTING', 'MATCH_SINGLE', 'MATCH_SERIES', 'SHOOT_OFF', 'OTHER')),
        affected_lane_ids_json TEXT NOT NULL CHECK (json_valid(affected_lane_ids_json)),
        summary TEXT NOT NULL,
        opened_by TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_final_recovery_cases_competition
        ON final_recovery_cases(competition_id, occurred_at, id);
      CREATE INDEX IF NOT EXISTS idx_final_recovery_cases_event
        ON final_recovery_cases(event_id, occurred_at, id) WHERE event_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_final_recovery_cases_run
        ON final_recovery_cases(final_run_id, occurred_at, id) WHERE final_run_id IS NOT NULL;

      CREATE TABLE IF NOT EXISTS final_recovery_entries (
        id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL REFERENCES final_recovery_cases(id),
        entry_type TEXT NOT NULL CHECK (entry_type IN (
          'NOTE', 'STOP_RECORDED', 'JURY_RULING', 'REMEDY_AUTHORIZED', 'RESUMED', 'COMPLETED', 'VOID'
        )),
        statement TEXT NOT NULL,
        official_name TEXT NOT NULL,
        rule_reference TEXT,
        classification TEXT CHECK (classification IS NULL OR classification IN (
          'ALLOWABLE_MALFUNCTION', 'NON_ALLOWABLE_MALFUNCTION', 'TARGET_MALFUNCTION',
          'SHOT_CONFIRMED_MISS', 'COMMAND_CONFIRMED', 'COMMAND_NOT_CONFIRMED', 'OTHER'
        )),
        remedy TEXT CHECK (remedy IS NULL OR remedy IN (
          'NONE', 'FIRE_TEST_SHOT', 'REPEAT_SINGLE_SHOT', 'COMPLETE_SERIES', 'REPEAT_SERIES',
          'COUNT_DISPLAYED_SHOTS', 'MOVE_TO_RESERVE_TARGET', 'RESTART_PREPARATION_AND_SIGHTING',
          'GRANT_TWO_MINUTE_SIGHTING', 'RESET_TO_ORIGINAL_TIME',
          'RESTART_WITH_REMAINING_TIME_PLUS_60', 'NULLIFY_EXTRA_SHOTS_WITHOUT_PENALTY',
          'APPLY_RULE_PENALTY', 'CONTINUE', 'OTHER'
        )),
        remaining_time_seconds INTEGER CHECK (remaining_time_seconds IS NULL OR remaining_time_seconds >= 0),
        granted_time_seconds INTEGER CHECK (granted_time_seconds IS NULL OR granted_time_seconds >= 0),
        shot_count INTEGER CHECK (shot_count IS NULL OR shot_count >= 0),
        occurred_at TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        CHECK ((entry_type = 'JURY_RULING') = (classification IS NOT NULL)),
        CHECK ((entry_type = 'REMEDY_AUTHORIZED') = (remedy IS NOT NULL)),
        CHECK (entry_type = 'REMEDY_AUTHORIZED' OR (granted_time_seconds IS NULL AND shot_count IS NULL))
      );

      CREATE INDEX IF NOT EXISTS idx_final_recovery_entries_case
        ON final_recovery_entries(case_id, recorded_at, id);

      CREATE TRIGGER IF NOT EXISTS trg_final_recovery_cases_no_update BEFORE UPDATE ON final_recovery_cases
      BEGIN SELECT RAISE(ABORT, 'Final recovery cases are append-only'); END;
      CREATE TRIGGER IF NOT EXISTS trg_final_recovery_cases_no_delete BEFORE DELETE ON final_recovery_cases
      BEGIN SELECT RAISE(ABORT, 'Final recovery cases are append-only'); END;
      CREATE TRIGGER IF NOT EXISTS trg_final_recovery_entries_no_update BEFORE UPDATE ON final_recovery_entries
      BEGIN SELECT RAISE(ABORT, 'Final recovery entries are append-only'); END;
      CREATE TRIGGER IF NOT EXISTS trg_final_recovery_entries_no_delete BEFORE DELETE ON final_recovery_entries
      BEGIN SELECT RAISE(ABORT, 'Final recovery entries are append-only'); END;

      DROP TRIGGER IF EXISTS trg_adjudication_case_links_no_update;
      DROP TRIGGER IF EXISTS trg_adjudication_case_links_no_delete;

      CREATE TABLE adjudication_case_links_v38 (
        id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL REFERENCES adjudication_cases(id),
        operation TEXT NOT NULL CHECK (operation IN ('ADD', 'REMOVE')),
        artifact_type TEXT NOT NULL CHECK (artifact_type IN (
          'SCORING_DECISION', 'RANGE_INCIDENT_REPORT', 'PROTEST', 'RANGE_INTERRUPTION',
          'TARGET_EXAMINATION', 'FINAL_OPERATION', 'FINAL_RECOVERY', 'OTHER'
        )),
        artifact_id TEXT NOT NULL,
        relation TEXT NOT NULL CHECK (relation IN ('SOURCE', 'EVIDENCE', 'DECISION', 'REPORT', 'PROTEST', 'RECOVERY', 'RELATED')),
        label_snapshot TEXT NOT NULL,
        statement TEXT NOT NULL,
        official_name TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        reverses_link_id TEXT REFERENCES adjudication_case_links_v38(id),
        CHECK (
          (operation = 'ADD' AND reverses_link_id IS NULL)
          OR (operation = 'REMOVE' AND reverses_link_id IS NOT NULL)
        )
      );

      INSERT INTO adjudication_case_links_v38 (
        id, case_id, operation, artifact_type, artifact_id, relation, label_snapshot,
        statement, official_name, recorded_at, reverses_link_id
      )
      SELECT id, case_id, operation, artifact_type, artifact_id, relation, label_snapshot,
             statement, official_name, recorded_at, reverses_link_id
      FROM adjudication_case_links;

      DROP TABLE adjudication_case_links;
      ALTER TABLE adjudication_case_links_v38 RENAME TO adjudication_case_links;

      CREATE INDEX idx_adjudication_case_links_case
        ON adjudication_case_links(case_id, recorded_at, id);
      CREATE UNIQUE INDEX uq_adjudication_case_link_removal
        ON adjudication_case_links(reverses_link_id) WHERE operation = 'REMOVE';
      CREATE TRIGGER trg_adjudication_case_links_no_update BEFORE UPDATE ON adjudication_case_links
      BEGIN SELECT RAISE(ABORT, 'Adjudication links are append-only'); END;
      CREATE TRIGGER trg_adjudication_case_links_no_delete BEFORE DELETE ON adjudication_case_links
      BEGIN SELECT RAISE(ABORT, 'Adjudication links are append-only'); END;
    `);
  },
};
