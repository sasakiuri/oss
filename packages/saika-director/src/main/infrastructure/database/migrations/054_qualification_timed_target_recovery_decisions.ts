import type { Migration } from './Migration';

/** Official decisions stay independent from both policy recommendations and Lane execution. */
export const migration054QualificationTimedTargetRecoveryDecisions: Migration = {
  version: 54,
  name: 'qualification_timed_target_recovery_decisions',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS qualification_timed_target_recovery_decisions (
        id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL REFERENCES range_interruption_cases(id),
        supersedes_decision_id TEXT REFERENCES qualification_timed_target_recovery_decisions(id),
        recommendation_json TEXT NOT NULL,
        authorized_recovery_json TEXT NOT NULL,
        follows_recommendation INTEGER NOT NULL CHECK (follows_recommendation IN (0, 1)),
        statement TEXT NOT NULL,
        official_name TEXT NOT NULL,
        incident_report_reference TEXT NOT NULL,
        rule_reference TEXT NOT NULL,
        decided_at TEXT NOT NULL,
        recorded_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_qualification_timed_target_recovery_decisions_case
        ON qualification_timed_target_recovery_decisions(case_id, recorded_at);

      CREATE TRIGGER IF NOT EXISTS trg_qualification_timed_target_recovery_decisions_no_update
      BEFORE UPDATE ON qualification_timed_target_recovery_decisions
      BEGIN
        SELECT RAISE(ABORT, 'Qualification timed-target recovery decisions are append-only');
      END;

      CREATE TRIGGER IF NOT EXISTS trg_qualification_timed_target_recovery_decisions_no_delete
      BEFORE DELETE ON qualification_timed_target_recovery_decisions
      BEGIN
        SELECT RAISE(ABORT, 'Qualification timed-target recovery decisions are append-only');
      END;
    `);
  },
};
