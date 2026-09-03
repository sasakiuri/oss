import type { Migration } from './Migration';

/** Adds the individual ISSF 6.10.3.2 EST checks and relay-wide evidence phase. */
export const migration041IssfEstRelayChecklist: Migration = {
  version: 41,
  name: 'issf_est_relay_checklist',
  up(db) {
    db.exec(`
      DROP TRIGGER IF EXISTS trg_relay_readiness_no_update;
      DROP TRIGGER IF EXISTS trg_relay_readiness_no_delete;
      DROP INDEX IF EXISTS idx_relay_readiness_scope;

      ALTER TABLE relay_readiness_entries RENAME TO relay_readiness_entries_v23;

      CREATE TABLE relay_readiness_entries (
        id TEXT PRIMARY KEY,
        competition_id TEXT NOT NULL,
        relay_number INTEGER NOT NULL CHECK (relay_number > 0),
        lane_id TEXT,
        phase TEXT NOT NULL CHECK (phase IN ('RELAY', 'SIGHTING', 'MATCH')),
        requirement TEXT NOT NULL CHECK (requirement IN (
          'RANGE_EQUIPMENT_READY',
          'TARGET_MODE_CONFIRMED',
          'BACKUP_MEMORY_READY',
          'TARGET_WHITE_SURFACE_CLEAR',
          'TARGET_FRAME_MARKS_INDICATED',
          'CONTROL_SHEET_RENEWED',
          'BACKING_MATERIAL_CLEAR'
        )),
        state TEXT NOT NULL CHECK (state IN ('CONFIRMED', 'REVOKED')),
        source TEXT NOT NULL CHECK (source IN ('MANUAL', 'LANE_REPORTED', 'IMPORT')),
        statement TEXT NOT NULL,
        official_name TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        CHECK (
          (requirement IN (
            'TARGET_MODE_CONFIRMED',
            'TARGET_WHITE_SURFACE_CLEAR',
            'TARGET_FRAME_MARKS_INDICATED',
            'CONTROL_SHEET_RENEWED',
            'BACKING_MATERIAL_CLEAR'
          ) AND lane_id IS NOT NULL)
          OR (requirement IN ('RANGE_EQUIPMENT_READY', 'BACKUP_MEMORY_READY') AND lane_id IS NULL)
        ),
        CHECK (
          (requirement = 'TARGET_MODE_CONFIRMED' AND phase IN ('SIGHTING', 'MATCH'))
          OR (requirement <> 'TARGET_MODE_CONFIRMED' AND phase = 'RELAY')
        )
      );

      INSERT INTO relay_readiness_entries (
        id, competition_id, relay_number, lane_id, phase, requirement,
        state, source, statement, official_name, recorded_at
      )
      SELECT
        id, competition_id, relay_number, lane_id,
        CASE WHEN requirement = 'TARGET_MODE_CONFIRMED' THEN phase ELSE 'RELAY' END,
        requirement, state, source, statement, official_name, recorded_at
      FROM relay_readiness_entries_v23;

      DROP TABLE relay_readiness_entries_v23;

      CREATE INDEX idx_relay_readiness_scope
        ON relay_readiness_entries(competition_id, relay_number, phase, recorded_at, id);

      CREATE TRIGGER trg_relay_readiness_no_update
      BEFORE UPDATE ON relay_readiness_entries
      BEGIN
        SELECT RAISE(ABORT, 'Relay readiness evidence is append-only');
      END;

      CREATE TRIGGER trg_relay_readiness_no_delete
      BEFORE DELETE ON relay_readiness_entries
      BEGIN
        SELECT RAISE(ABORT, 'Relay readiness evidence is append-only');
      END;
    `);
  },
};
