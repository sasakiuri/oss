import type { Migration } from './Migration';

export const migration024RangeInterruptionBatches: Migration = {
  version: 24,
  name: 'range_interruption_command_batches',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS range_interruption_command_batches (
        id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL REFERENCES range_interruption_cases(id),
        competition_id TEXT NOT NULL,
        operation TEXT NOT NULL CHECK (operation IN ('PAUSE', 'RESUME', 'MATCH_RESUME')),
        target_lane_ids_json TEXT NOT NULL CHECK (json_valid(target_lane_ids_json)),
        success INTEGER NOT NULL CHECK (success IN (0, 1)),
        results_json TEXT NOT NULL CHECK (json_valid(results_json)),
        official_name TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        recorded_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_range_interruption_batches_case
        ON range_interruption_command_batches(case_id, recorded_at, id);

      CREATE TRIGGER IF NOT EXISTS trg_range_interruption_batches_no_update
      BEFORE UPDATE ON range_interruption_command_batches
      BEGIN
        SELECT RAISE(ABORT, 'Range interruption command batches are append-only');
      END;

      CREATE TRIGGER IF NOT EXISTS trg_range_interruption_batches_no_delete
      BEFORE DELETE ON range_interruption_command_batches
      BEGIN
        SELECT RAISE(ABORT, 'Range interruption command batches are append-only');
      END;
    `);
  },
};
