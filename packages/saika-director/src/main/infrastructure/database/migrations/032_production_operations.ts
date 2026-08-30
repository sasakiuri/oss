import type { Migration } from './Migration';

export const migration032ProductionOperations: Migration = {
  version: 32,
  name: 'production_operations',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS production_operation_entries (
        id TEXT PRIMARY KEY,
        competition_id TEXT NOT NULL,
        competition_type_id TEXT NOT NULL,
        round_name TEXT NOT NULL,
        phase TEXT NOT NULL,
        action TEXT NOT NULL CHECK (action IN (
          'MUSIC_PROGRAM_APPROVED', 'MUSIC_PROGRAM_APPROVAL_REVOKED',
          'MUSIC_STARTED', 'MUSIC_STOPPED',
          'FINAL_PRODUCTION_CONFIRMED', 'FINAL_PRODUCTION_REVOKED',
          'ANNOUNCEMENT_NOTE'
        )),
        statement TEXT NOT NULL,
        official_name TEXT NOT NULL,
        recorded_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_production_operations_competition
        ON production_operation_entries(competition_id, recorded_at, id);
      CREATE TRIGGER IF NOT EXISTS trg_production_operations_no_update
      BEFORE UPDATE ON production_operation_entries
      BEGIN SELECT RAISE(ABORT, 'Production operations are append-only'); END;
      CREATE TRIGGER IF NOT EXISTS trg_production_operations_no_delete
      BEFORE DELETE ON production_operation_entries
      BEGIN SELECT RAISE(ABORT, 'Production operations are append-only'); END;
    `);
  },
};
