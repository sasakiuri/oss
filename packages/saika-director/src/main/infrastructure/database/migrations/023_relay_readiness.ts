import type { Migration } from './Migration';

/** Append-only evidence for the pre-start checks performed for each relay. */
export const migration023RelayReadiness: Migration = {
  version: 23,
  name: 'relay_readiness',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS relay_readiness_entries (
        id TEXT PRIMARY KEY,
        competition_id TEXT NOT NULL,
        relay_number INTEGER NOT NULL CHECK (relay_number > 0),
        lane_id TEXT,
        phase TEXT NOT NULL CHECK (phase IN ('SIGHTING', 'MATCH')),
        requirement TEXT NOT NULL CHECK (requirement IN (
          'RANGE_EQUIPMENT_READY',
          'TARGET_MODE_CONFIRMED',
          'BACKUP_MEMORY_READY'
        )),
        state TEXT NOT NULL CHECK (state IN ('CONFIRMED', 'REVOKED')),
        source TEXT NOT NULL CHECK (source IN ('MANUAL', 'LANE_REPORTED', 'IMPORT')),
        statement TEXT NOT NULL,
        official_name TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        CHECK (
          (requirement = 'TARGET_MODE_CONFIRMED' AND lane_id IS NOT NULL)
          OR (requirement <> 'TARGET_MODE_CONFIRMED' AND lane_id IS NULL)
        )
      );

      CREATE INDEX IF NOT EXISTS idx_relay_readiness_scope
        ON relay_readiness_entries(competition_id, relay_number, phase, recorded_at, id);

      CREATE TRIGGER IF NOT EXISTS trg_relay_readiness_no_update
      BEFORE UPDATE ON relay_readiness_entries
      BEGIN
        SELECT RAISE(ABORT, 'Relay readiness evidence is append-only');
      END;

      CREATE TRIGGER IF NOT EXISTS trg_relay_readiness_no_delete
      BEFORE DELETE ON relay_readiness_entries
      BEGIN
        SELECT RAISE(ABORT, 'Relay readiness evidence is append-only');
      END;
    `);
  },
};
