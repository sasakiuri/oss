import type { Migration } from './Migration';

/** Append-only qualification malfunction claims, determinations, remedies, and audit snapshots. */
export const migration059QualificationMalfunctions: Migration = {
  version: 59,
  name: 'qualification_malfunctions',
  up(db) {
    db.exec(`
      CREATE TABLE qualification_malfunction_cases (
        id TEXT PRIMARY KEY,
        competition_id TEXT NOT NULL,
        event_id TEXT NOT NULL REFERENCES events(id),
        competition_type_id TEXT NOT NULL,
        rule_pack_id TEXT,
        rule_pack_schema_version INTEGER CHECK(rule_pack_schema_version IS NULL OR rule_pack_schema_version = 1),
        rule_pack_fingerprint_sha256 TEXT CHECK(
          rule_pack_fingerprint_sha256 IS NULL
          OR (rule_pack_fingerprint_sha256 NOT GLOB '*[^0-9a-f]*'
            AND length(rule_pack_fingerprint_sha256) = 64)
        ),
        policy_snapshot_json TEXT NOT NULL CHECK(json_valid(policy_snapshot_json)),
        participant_id TEXT NOT NULL REFERENCES participants(id),
        participant_name_snapshot TEXT NOT NULL,
        start_number_snapshot TEXT,
        lane_id TEXT NOT NULL,
        lane_channel_snapshot INTEGER NOT NULL CHECK(lane_channel_snapshot > 0),
        relay_number_snapshot INTEGER NOT NULL CHECK(relay_number_snapshot > 0),
        report_source TEXT NOT NULL CHECK(report_source IN ('LANE_SIGNAL', 'DIRECTOR_MANUAL')),
        claim_mode TEXT NOT NULL CHECK(claim_mode IN ('CLAIM', 'DOCUMENTATION_ONLY')),
        phase TEXT NOT NULL CHECK(phase IN ('SIGHTING', 'MATCH')),
        stage_id TEXT,
        stage_index INTEGER NOT NULL CHECK(stage_index >= 0),
        series_index INTEGER NOT NULL CHECK(series_index >= 0),
        series_shot_limit INTEGER CHECK(series_shot_limit IS NULL OR series_shot_limit > 0),
        recorded_shots INTEGER NOT NULL CHECK(recorded_shots >= 0),
        timed_target_program_id TEXT,
        exposure_index INTEGER CHECK(exposure_index IS NULL OR exposure_index >= 0),
        lane_session_id TEXT,
        lane_snapshot_captured_at TEXT,
        exceptional_match_part INTEGER CHECK(exceptional_match_part IS NULL OR exceptional_match_part IN (1, 2)),
        existing_claims_in_scope INTEGER NOT NULL CHECK(existing_claims_in_scope >= 0),
        existing_claims_in_part INTEGER CHECK(existing_claims_in_part IS NULL OR existing_claims_in_part >= 0),
        claim_assessment_json TEXT NOT NULL CHECK(json_valid(claim_assessment_json)),
        summary TEXT NOT NULL,
        opened_by TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        CHECK(
          (rule_pack_id IS NULL AND rule_pack_schema_version IS NULL AND rule_pack_fingerprint_sha256 IS NULL)
          OR (rule_pack_id IS NOT NULL AND rule_pack_schema_version = 1
            AND rule_pack_fingerprint_sha256 IS NOT NULL)
        ),
        CHECK(exposure_index IS NULL OR timed_target_program_id IS NOT NULL),
        CHECK(series_shot_limit IS NULL OR recorded_shots <= series_shot_limit),
        CHECK((exceptional_match_part IS NULL) = (existing_claims_in_part IS NULL)),
        CHECK(exceptional_match_part IS NULL OR phase = 'MATCH'),
        CHECK(
          (report_source = 'LANE_SIGNAL' AND lane_snapshot_captured_at IS NOT NULL)
          OR (report_source = 'DIRECTOR_MANUAL' AND lane_snapshot_captured_at IS NULL)
        ),
        CHECK(length(trim(competition_type_id)) > 0),
        CHECK(length(trim(participant_name_snapshot)) > 0),
        CHECK(length(trim(summary)) > 0),
        CHECK(length(trim(opened_by)) > 0),
        FOREIGN KEY(event_id, participant_id) REFERENCES participants(event_id, id)
      );

      CREATE INDEX idx_qualification_malfunctions_competition
        ON qualification_malfunction_cases(competition_id, occurred_at, id);
      CREATE INDEX idx_qualification_malfunctions_event_participant
        ON qualification_malfunction_cases(event_id, participant_id, occurred_at, id);

      CREATE TABLE qualification_malfunction_entries (
        id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL REFERENCES qualification_malfunction_cases(id),
        entry_type TEXT NOT NULL CHECK(entry_type IN (
          'NOTE', 'INSPECTION_RECORDED', 'CLASSIFIED', 'REPAIR_STARTED', 'REPAIR_EXTENDED',
          'REPAIR_COMPLETED', 'REMEDY_AUTHORIZED', 'EXECUTION_RECORDED', 'SCORE_SETTLED',
          'COMPLETED', 'VOID'
        )),
        statement TEXT NOT NULL,
        official_name TEXT NOT NULL,
        official_role TEXT NOT NULL CHECK(official_role IN (
          'RANGE_OFFICER', 'CRO', 'JURY_MEMBER', 'RTS_OFFICER', 'TECHNICAL_OFFICER'
        )),
        rule_reference TEXT,
        classification TEXT CHECK(classification IS NULL OR classification IN ('ALLOWABLE', 'NON_ALLOWABLE')),
        cause_code TEXT,
        remedy TEXT CHECK(remedy IS NULL OR remedy IN (
          'CONTINUE_WITHIN_ORIGINAL_TIME', 'REPEAT_FULL_SERIES', 'COMPLETE_REMAINING_SHOTS',
          'SCORE_UNFIRED_AS_MISS', 'NO_FURTHER_ACTION'
        )),
        shots_to_fire INTEGER CHECK(shots_to_fire IS NULL OR shots_to_fire >= 0),
        repair_seconds INTEGER CHECK(repair_seconds IS NULL OR repair_seconds > 0),
        artifact_id TEXT,
        occurred_at TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        CHECK(
          (entry_type = 'CLASSIFIED' AND classification IS NOT NULL AND cause_code IS NOT NULL)
          OR (entry_type <> 'CLASSIFIED' AND classification IS NULL AND cause_code IS NULL)
        ),
        CHECK(
          (entry_type = 'REMEDY_AUTHORIZED' AND remedy IS NOT NULL AND shots_to_fire IS NOT NULL)
          OR (entry_type <> 'REMEDY_AUTHORIZED' AND remedy IS NULL AND shots_to_fire IS NULL)
        ),
        CHECK(
          (entry_type = 'REPAIR_EXTENDED' AND repair_seconds IS NOT NULL)
          OR (entry_type <> 'REPAIR_EXTENDED' AND repair_seconds IS NULL)
        ),
        CHECK(entry_type NOT IN ('EXECUTION_RECORDED', 'SCORE_SETTLED') OR artifact_id IS NOT NULL),
        CHECK(length(trim(statement)) > 0),
        CHECK(length(trim(official_name)) > 0)
      );

      CREATE INDEX idx_qualification_malfunction_entries_case
        ON qualification_malfunction_entries(case_id, recorded_at, id);

      CREATE TRIGGER trg_qualification_malfunction_cases_no_update
      BEFORE UPDATE ON qualification_malfunction_cases
      BEGIN SELECT RAISE(ABORT, 'Qualification malfunction cases are append-only'); END;

      CREATE TRIGGER trg_qualification_malfunction_cases_no_delete
      BEFORE DELETE ON qualification_malfunction_cases
      BEGIN SELECT RAISE(ABORT, 'Qualification malfunction cases are append-only'); END;

      CREATE TRIGGER trg_qualification_malfunction_entries_no_update
      BEFORE UPDATE ON qualification_malfunction_entries
      BEGIN SELECT RAISE(ABORT, 'Qualification malfunction entries are append-only'); END;

      CREATE TRIGGER trg_qualification_malfunction_entries_no_delete
      BEFORE DELETE ON qualification_malfunction_entries
      BEGIN SELECT RAISE(ABORT, 'Qualification malfunction entries are append-only'); END;
    `);
  },
};
