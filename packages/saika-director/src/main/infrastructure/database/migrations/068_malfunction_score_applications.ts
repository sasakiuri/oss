import type { Migration } from './Migration';
export const migration068MalfunctionScoreApplications: Migration = {
  version: 68,
  name: 'malfunction_score_applications',
  up(db) {
    // Preserve both entry identities and row order while extending the journal.
    db.exec(`
      CREATE TABLE qualification_malfunction_entries_v68 (
        id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL REFERENCES qualification_malfunction_cases(id),
        entry_type TEXT NOT NULL CHECK(entry_type IN (
          'NOTE', 'INSPECTION_RECORDED', 'CLASSIFIED', 'REPAIR_STARTED', 'REPAIR_EXTENDED',
          'REPAIR_COMPLETED', 'REMEDY_AUTHORIZED', 'EXECUTION_RECORDED', 'SCORE_SETTLED', 'SCORE_REOPENED',
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
        CHECK(entry_type NOT IN ('EXECUTION_RECORDED', 'SCORE_SETTLED', 'SCORE_REOPENED') OR artifact_id IS NOT NULL),
        CHECK(length(trim(statement)) > 0),
        CHECK(length(trim(official_name)) > 0)
      );

      INSERT INTO qualification_malfunction_entries_v68
        (rowid, id, case_id, entry_type, statement, official_name, official_role, rule_reference,
         classification, cause_code, remedy, shots_to_fire, repair_seconds, artifact_id, occurred_at, recorded_at)
        SELECT rowid, * FROM qualification_malfunction_entries;
      DROP TABLE qualification_malfunction_entries;
      ALTER TABLE qualification_malfunction_entries_v68 RENAME TO qualification_malfunction_entries;
      CREATE INDEX idx_qualification_malfunction_entries_case ON qualification_malfunction_entries(case_id, recorded_at, id);
      CREATE TRIGGER trg_qualification_malfunction_entries_no_update BEFORE UPDATE ON qualification_malfunction_entries
        BEGIN SELECT RAISE(ABORT, 'Qualification malfunction entries are append-only'); END;
      CREATE TRIGGER trg_qualification_malfunction_entries_no_delete BEFORE DELETE ON qualification_malfunction_entries
        BEGIN SELECT RAISE(ABORT, 'Qualification malfunction entries are append-only'); END;
    `);
    db.exec(`CREATE TABLE malfunction_score_applications (
      id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES qualification_malfunction_cases(id),
      event_id TEXT NOT NULL, participant_id TEXT NOT NULL, relay_number INTEGER NOT NULL,
      snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json))
    );
    CREATE INDEX malfunction_score_applications_target ON malfunction_score_applications(event_id, participant_id, relay_number);
    CREATE TABLE malfunction_score_withdrawals (
      id TEXT PRIMARY KEY, application_id TEXT NOT NULL UNIQUE REFERENCES malfunction_score_applications(id),
      snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json))
    );`);
    for (const table of ['malfunction_score_applications', 'malfunction_score_withdrawals']) {
      db.exec(`CREATE TRIGGER ${table}_no_update BEFORE UPDATE ON ${table}
        BEGIN SELECT RAISE(ABORT, 'Score application history is append-only'); END;
        CREATE TRIGGER ${table}_no_delete BEFORE DELETE ON ${table}
        BEGIN SELECT RAISE(ABORT, 'Score application history is append-only'); END;`);
    }
  },
};
