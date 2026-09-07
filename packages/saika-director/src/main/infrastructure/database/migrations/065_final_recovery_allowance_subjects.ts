import type { Migration } from './Migration';

export const migration065FinalRecoveryAllowanceSubjects: Migration = {
  version: 65,
  name: 'final_recovery_allowance_subjects',
  up(db) {
    db.exec(`ALTER TABLE final_recovery_cases ADD COLUMN allowance_subject_json TEXT
      CHECK (allowance_subject_json IS NULL OR json_valid(allowance_subject_json));
      CREATE TABLE final_recovery_allowance_subjects (
        case_id TEXT PRIMARY KEY REFERENCES final_recovery_cases(id),
        subject_json TEXT NOT NULL CHECK (json_valid(subject_json))
      );
      CREATE TRIGGER final_recovery_allowance_subjects_no_update BEFORE UPDATE ON final_recovery_allowance_subjects
      BEGIN SELECT RAISE(ABORT, 'Final recovery identities are append-only'); END;
      CREATE TRIGGER final_recovery_allowance_subjects_no_delete BEFORE DELETE ON final_recovery_allowance_subjects
      BEGIN SELECT RAISE(ABORT, 'Final recovery identities are append-only'); END;
    `);
  },
};
