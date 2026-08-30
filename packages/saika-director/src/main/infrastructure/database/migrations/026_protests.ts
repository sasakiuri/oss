import type { Migration } from './Migration';

export const migration026Protests: Migration = {
  version: 26,
  name: 'protests_and_appeals',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS protest_cases (
        id TEXT PRIMARY KEY,
        scope_type TEXT NOT NULL CHECK (scope_type IN ('COMPETITION', 'EVENT')),
        scope_id TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('VERBAL', 'WRITTEN', 'FINAL_VERBAL', 'APPEAL')),
        parent_protest_id TEXT REFERENCES protest_cases(id),
        subject TEXT NOT NULL,
        statement TEXT NOT NULL,
        lodged_by TEXT NOT NULL,
        lodged_at TEXT NOT NULL,
        triggering_decision_at TEXT,
        form_reference TEXT,
        fee_paid_euro INTEGER CHECK (fee_paid_euro IS NULL OR fee_paid_euro >= 0),
        late_acceptance_reason TEXT,
        opened_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        CHECK ((kind = 'APPEAL' AND parent_protest_id IS NOT NULL) OR (kind <> 'APPEAL' AND parent_protest_id IS NULL))
      );

      CREATE INDEX IF NOT EXISTS idx_protest_cases_scope
        ON protest_cases(scope_type, scope_id, lodged_at, id);

      CREATE TABLE IF NOT EXISTS protest_entries (
        id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL REFERENCES protest_cases(id),
        entry_type TEXT NOT NULL CHECK (entry_type IN (
          'FORWARDED_TO_JURY', 'DECIDED_UPHELD', 'DECIDED_PARTLY_UPHELD', 'DECIDED_REJECTED',
          'FEE_REFUNDED', 'FEE_RETAINED', 'NOTE', 'CLOSED', 'VOID'
        )),
        statement TEXT NOT NULL,
        official_name TEXT NOT NULL,
        rule_reference TEXT,
        occurred_at TEXT NOT NULL,
        recorded_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_protest_entries_case ON protest_entries(case_id, occurred_at, id);

      CREATE TRIGGER IF NOT EXISTS trg_protest_cases_no_update BEFORE UPDATE ON protest_cases
      BEGIN SELECT RAISE(ABORT, 'Protest cases are append-only'); END;
      CREATE TRIGGER IF NOT EXISTS trg_protest_cases_no_delete BEFORE DELETE ON protest_cases
      BEGIN SELECT RAISE(ABORT, 'Protest cases are append-only'); END;
      CREATE TRIGGER IF NOT EXISTS trg_protest_entries_no_update BEFORE UPDATE ON protest_entries
      BEGIN SELECT RAISE(ABORT, 'Protest entries are append-only'); END;
      CREATE TRIGGER IF NOT EXISTS trg_protest_entries_no_delete BEFORE DELETE ON protest_entries
      BEGIN SELECT RAISE(ABORT, 'Protest entries are append-only'); END;
    `);
  },
};
