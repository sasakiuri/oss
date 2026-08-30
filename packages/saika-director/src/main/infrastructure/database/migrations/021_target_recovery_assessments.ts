import type { Migration } from './Migration';

export const migration021TargetRecoveryAssessments: Migration = {
  version: 21,
  name: 'target_recovery_assessments',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS target_recovery_assessments (
        id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL REFERENCES range_interruption_cases(id),
        repair_completed_at TEXT,
        moved_to_reserve_firing_point INTEGER NOT NULL
          CHECK (moved_to_reserve_firing_point IN (0, 1)),
        reserve_firing_point_number INTEGER
          CHECK (reserve_firing_point_number IS NULL OR reserve_firing_point_number > 0),
        statement TEXT NOT NULL,
        official_name TEXT NOT NULL,
        assessed_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_target_recovery_assessments_case
        ON target_recovery_assessments(case_id, assessed_at, id);

      CREATE TRIGGER IF NOT EXISTS trg_target_recovery_assessments_no_update
      BEFORE UPDATE ON target_recovery_assessments
      BEGIN
        SELECT RAISE(ABORT, 'Target recovery assessments are append-only');
      END;

      CREATE TRIGGER IF NOT EXISTS trg_target_recovery_assessments_no_delete
      BEFORE DELETE ON target_recovery_assessments
      BEGIN
        SELECT RAISE(ABORT, 'Target recovery assessments are append-only');
      END;
    `);
  },
};
