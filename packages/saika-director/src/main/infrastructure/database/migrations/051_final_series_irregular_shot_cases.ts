import type { Migration } from './Migration';

/** Expands the append-only irregular-shot ledger with RulePack-defined Final series incidents. */
export const migration051FinalSeriesIrregularShotCases: Migration = {
  version: 51,
  name: 'final_series_irregular_shot_cases',
  up(db) {
    db.exec(`
      DROP TRIGGER IF EXISTS trg_irregular_shot_cases_no_update;
      DROP TRIGGER IF EXISTS trg_irregular_shot_cases_no_delete;
      DROP TRIGGER IF EXISTS trg_irregular_shot_evidence_no_update;
      DROP TRIGGER IF EXISTS trg_irregular_shot_evidence_no_delete;
      DROP TRIGGER IF EXISTS trg_irregular_shot_case_entries_no_update;
      DROP TRIGGER IF EXISTS trg_irregular_shot_case_entries_no_delete;

      CREATE TABLE irregular_shot_cases_v51 (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL REFERENCES events(id),
        competition_id TEXT NOT NULL,
        result_scope TEXT NOT NULL CHECK (result_scope IN ('QUALIFICATION', 'FINAL')),
        kind TEXT NOT NULL CHECK (kind IN (
          'EXCESS_SHOTS', 'CROSS_FIRE', 'DISPUTED_SHOT',
          'LATE_OR_UNFIRED_SHOT', 'MULTIPLE_SHOTS_SAME_TARGET', 'READY_POSITION'
        )),
        subject_lane_id TEXT NOT NULL,
        adjacent_lane_ids_json TEXT NOT NULL CHECK (json_valid(adjacent_lane_ids_json)),
        window_start_at TEXT NOT NULL,
        window_end_at TEXT NOT NULL,
        summary TEXT NOT NULL,
        rule_reference TEXT NOT NULL,
        opened_by TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE irregular_shot_evidence_v51 (
        id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL REFERENCES irregular_shot_cases_v51(id),
        relation TEXT NOT NULL CHECK (relation IN ('SUBJECT', 'POSSIBLE_SOURCE', 'RECIPIENT', 'CONTEXT')),
        observation_id TEXT NOT NULL,
        shot_id TEXT NOT NULL,
        lane_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        stage_index INTEGER NOT NULL CHECK (stage_index >= 0),
        series_index INTEGER NOT NULL CHECK (series_index >= 0),
        shot_number_in_series INTEGER NOT NULL CHECK (shot_number_in_series > 0),
        mode TEXT NOT NULL CHECK (mode IN ('SIGHTING', 'MATCH')),
        effective_score_x10 INTEGER NOT NULL CHECK (effective_score_x10 >= 0),
        fired_at TEXT NOT NULL,
        received_at TEXT NOT NULL,
        statement TEXT NOT NULL,
        official_name TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        UNIQUE (case_id, observation_id, relation)
      );

      CREATE TABLE irregular_shot_case_entries_v51 (
        id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL REFERENCES irregular_shot_cases_v51(id),
        entry_type TEXT NOT NULL CHECK (entry_type IN ('NOTE', 'REFERRED', 'RESOLVED', 'REOPENED', 'CLOSED', 'VOID')),
        statement TEXT NOT NULL,
        official_name TEXT NOT NULL,
        rule_reference TEXT,
        resolution_code TEXT CHECK (resolution_code IS NULL OR resolution_code IN (
          'EXCESS_IDENTIFIED', 'EXCESS_UNIDENTIFIED', 'CROSS_FIRE_CONFIRMED',
          'RECEIVED_CROSS_FIRE_CONFIRMED', 'SHOT_ANNULLED', 'SHOT_CREDITED',
          'HIT_PENALTY_APPLIED', 'DISQUALIFICATION_APPLIED', 'NO_SCORE_CHANGE'
        )),
        incident_report_id TEXT REFERENCES range_incident_reports(id),
        scoring_decision_ids_json TEXT NOT NULL CHECK (json_valid(scoring_decision_ids_json)),
        occurred_at TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        CHECK (
          (entry_type = 'RESOLVED' AND resolution_code IS NOT NULL AND incident_report_id IS NOT NULL)
          OR (entry_type <> 'RESOLVED' AND resolution_code IS NULL AND incident_report_id IS NULL
              AND json_array_length(scoring_decision_ids_json) = 0)
        )
      );

      INSERT INTO irregular_shot_cases_v51 SELECT * FROM irregular_shot_cases;
      INSERT INTO irregular_shot_evidence_v51 SELECT * FROM irregular_shot_evidence;
      INSERT INTO irregular_shot_case_entries_v51 SELECT * FROM irregular_shot_case_entries;

      DROP TABLE irregular_shot_case_entries;
      DROP TABLE irregular_shot_evidence;
      DROP TABLE irregular_shot_cases;

      ALTER TABLE irregular_shot_cases_v51 RENAME TO irregular_shot_cases;
      ALTER TABLE irregular_shot_evidence_v51 RENAME TO irregular_shot_evidence;
      ALTER TABLE irregular_shot_case_entries_v51 RENAME TO irregular_shot_case_entries;

      CREATE INDEX idx_irregular_shot_cases_event
        ON irregular_shot_cases(event_id, result_scope, occurred_at, id);
      CREATE INDEX idx_irregular_shot_cases_competition
        ON irregular_shot_cases(competition_id, occurred_at, id);
      CREATE INDEX idx_irregular_shot_evidence_case
        ON irregular_shot_evidence(case_id, fired_at, id);
      CREATE INDEX idx_irregular_shot_case_entries_case
        ON irregular_shot_case_entries(case_id, recorded_at, id);

      CREATE TRIGGER trg_irregular_shot_cases_no_update BEFORE UPDATE ON irregular_shot_cases
      BEGIN SELECT RAISE(ABORT, 'Irregular shot cases are append-only'); END;
      CREATE TRIGGER trg_irregular_shot_cases_no_delete BEFORE DELETE ON irregular_shot_cases
      BEGIN SELECT RAISE(ABORT, 'Irregular shot cases are append-only'); END;
      CREATE TRIGGER trg_irregular_shot_evidence_no_update BEFORE UPDATE ON irregular_shot_evidence
      BEGIN SELECT RAISE(ABORT, 'Irregular shot evidence is append-only'); END;
      CREATE TRIGGER trg_irregular_shot_evidence_no_delete BEFORE DELETE ON irregular_shot_evidence
      BEGIN SELECT RAISE(ABORT, 'Irregular shot evidence is append-only'); END;
      CREATE TRIGGER trg_irregular_shot_case_entries_no_update BEFORE UPDATE ON irregular_shot_case_entries
      BEGIN SELECT RAISE(ABORT, 'Irregular shot case entries are append-only'); END;
      CREATE TRIGGER trg_irregular_shot_case_entries_no_delete BEFORE DELETE ON irregular_shot_case_entries
      BEGIN SELECT RAISE(ABORT, 'Irregular shot case entries are append-only'); END;
    `);
  },
};
