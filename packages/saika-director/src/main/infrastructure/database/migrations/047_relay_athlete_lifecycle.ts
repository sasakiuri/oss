import type { Migration } from './Migration';

/** Immutable athlete identity, equipment, firearm-clear and printout evidence. */
export const migration047RelayAthleteLifecycle: Migration = {
  version: 47,
  name: 'relay_athlete_lifecycle',
  up(db) {
    db.exec(`
      CREATE TABLE relay_athlete_lifecycle_entries (
        id TEXT PRIMARY KEY,
        competition_id TEXT NOT NULL,
        relay_number INTEGER NOT NULL CHECK (relay_number > 0),
        lane_id TEXT NOT NULL,
        athlete_id TEXT NOT NULL,
        athlete_name TEXT NOT NULL,
        athlete_start_number INTEGER NOT NULL CHECK (athlete_start_number > 0),
        phase TEXT NOT NULL CHECK (phase IN ('PRE_RELAY', 'POST_RELAY')),
        requirement TEXT NOT NULL CHECK (requirement IN (
          'ATHLETE_IDENTITY_BIB_VERIFIED',
          'EQUIPMENT_APPROVAL_VERIFIED',
          'FIREARM_UNLOADED_SAFETY_FLAG_VERIFIED',
          'PRINTOUT_ATHLETE_SIGNED',
          'PRINTOUT_OFFICIAL_INITIALLED',
          'ATHLETE_RELEASED'
        )),
        state TEXT NOT NULL CHECK (state IN ('CONFIRMED', 'REVOKED')),
        source TEXT NOT NULL CHECK (source IN ('MANUAL', 'LANE_REPORTED', 'IMPORT')),
        statement TEXT NOT NULL,
        official_name TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        CHECK (
          (phase = 'PRE_RELAY' AND requirement IN (
            'ATHLETE_IDENTITY_BIB_VERIFIED', 'EQUIPMENT_APPROVAL_VERIFIED'
          )) OR
          (phase = 'POST_RELAY' AND requirement IN (
            'FIREARM_UNLOADED_SAFETY_FLAG_VERIFIED', 'PRINTOUT_ATHLETE_SIGNED',
            'PRINTOUT_OFFICIAL_INITIALLED', 'ATHLETE_RELEASED'
          ))
        )
      );

      CREATE INDEX idx_relay_athlete_lifecycle_scope
        ON relay_athlete_lifecycle_entries(
          competition_id, relay_number, phase, lane_id, athlete_id, recorded_at, id
        );

      CREATE TRIGGER trg_relay_athlete_lifecycle_no_update
      BEFORE UPDATE ON relay_athlete_lifecycle_entries
      BEGIN
        SELECT RAISE(ABORT, 'Relay athlete lifecycle evidence is append-only');
      END;

      CREATE TRIGGER trg_relay_athlete_lifecycle_no_delete
      BEFORE DELETE ON relay_athlete_lifecycle_entries
      BEGIN
        SELECT RAISE(ABORT, 'Relay athlete lifecycle evidence is append-only');
      END;
    `);
  },
};
