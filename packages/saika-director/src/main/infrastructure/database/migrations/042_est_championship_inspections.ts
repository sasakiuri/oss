import type { Migration } from './Migration';

/** Append-only Technical Delegate supervised EST accuracy evidence (ISSF 6.3.2.8). */
export const migration042EstChampionshipInspections: Migration = {
  version: 42,
  name: 'est_championship_inspections',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS est_inspection_plans (
        id TEXT PRIMARY KEY,
        championship_id TEXT NOT NULL REFERENCES championships(id),
        version_number INTEGER NOT NULL CHECK (version_number > 0),
        target_identifiers_json TEXT NOT NULL CHECK (
          json_valid(target_identifiers_json) AND json_array_length(target_identifiers_json) > 0
        ),
        method_statement TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE (championship_id, version_number)
      );

      CREATE INDEX IF NOT EXISTS idx_est_inspection_plans_championship
        ON est_inspection_plans(championship_id, version_number, created_at, id);

      CREATE TABLE IF NOT EXISTS est_inspection_entries (
        id TEXT PRIMARY KEY,
        plan_id TEXT NOT NULL REFERENCES est_inspection_plans(id),
        target_identifier TEXT NOT NULL,
        outcome TEXT NOT NULL CHECK (outcome IN ('PASSED', 'FAILED')),
        statement TEXT NOT NULL,
        evidence_reference TEXT,
        performed_by TEXT NOT NULL,
        technical_delegate_name TEXT NOT NULL,
        inspected_at TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        revoked_entry_id TEXT REFERENCES est_inspection_entries(id),
        CHECK (revoked_entry_id IS NULL OR revoked_entry_id <> id)
      );

      CREATE INDEX IF NOT EXISTS idx_est_inspection_entries_plan
        ON est_inspection_entries(plan_id, target_identifier, recorded_at, id);
      CREATE UNIQUE INDEX IF NOT EXISTS uq_est_inspection_single_revocation
        ON est_inspection_entries(revoked_entry_id) WHERE revoked_entry_id IS NOT NULL;

      CREATE TRIGGER IF NOT EXISTS trg_est_inspection_plans_no_update BEFORE UPDATE ON est_inspection_plans
      BEGIN SELECT RAISE(ABORT, 'EST inspection plans are append-only'); END;
      CREATE TRIGGER IF NOT EXISTS trg_est_inspection_plans_no_delete BEFORE DELETE ON est_inspection_plans
      BEGIN SELECT RAISE(ABORT, 'EST inspection plans are append-only'); END;
      CREATE TRIGGER IF NOT EXISTS trg_est_inspection_entries_no_update BEFORE UPDATE ON est_inspection_entries
      BEGIN SELECT RAISE(ABORT, 'EST inspection entries are append-only'); END;
      CREATE TRIGGER IF NOT EXISTS trg_est_inspection_entries_no_delete BEFORE DELETE ON est_inspection_entries
      BEGIN SELECT RAISE(ABORT, 'EST inspection entries are append-only'); END;
    `);
  },
};
