import type { Migration } from './Migration';

/** Stores the per-Lane and per-athlete physical checks behind a safety-latch clear command. */
export const migration062RangeSafetyLaneClearances: Migration = {
  version: 62,
  name: 'range_safety_lane_clearances',
  up(db) {
    db.exec(`
      CREATE TABLE range_safety_lane_clearances (
        id TEXT PRIMARY KEY,
        audit_entry_id TEXT NOT NULL REFERENCES range_safety_stop_audit(id),
        safety_stop_id TEXT NOT NULL,
        lane_id TEXT NOT NULL,
        participant_id TEXT,
        participant_name TEXT,
        athlete_confirmation_status TEXT NOT NULL
          CHECK(athlete_confirmation_status IN ('CONFIRMED', 'NOT_APPLICABLE')),
        athlete_confirmed_by TEXT,
        not_applicable_reason TEXT,
        firearm_condition TEXT NOT NULL CHECK(firearm_condition IN (
          'UNLOADED_SAFETY_FLAG_INSERTED',
          'UNLOADED_ACTION_OPEN',
          'NO_FIREARM_PRESENT'
        )),
        personnel_clear INTEGER NOT NULL CHECK(personnel_clear = 1),
        verified_by TEXT NOT NULL CHECK(length(trim(verified_by)) > 0),
        verification_note TEXT,
        verified_at TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        rule_references_json TEXT NOT NULL CHECK(json_valid(rule_references_json)),
        UNIQUE(audit_entry_id, lane_id),
        CHECK((participant_id IS NULL) = (participant_name IS NULL)),
        CHECK(
          (athlete_confirmation_status = 'CONFIRMED'
            AND athlete_confirmed_by IS NOT NULL AND not_applicable_reason IS NULL)
          OR
          (athlete_confirmation_status = 'NOT_APPLICABLE'
            AND athlete_confirmed_by IS NULL AND not_applicable_reason IS NOT NULL)
        )
      );

      CREATE INDEX idx_range_safety_lane_clearances_stop
        ON range_safety_lane_clearances(safety_stop_id, lane_id, verified_at);

      CREATE TRIGGER trg_range_safety_lane_clearances_no_update
      BEFORE UPDATE ON range_safety_lane_clearances
      BEGIN
        SELECT RAISE(ABORT, 'Range safety Lane clearances are append-only');
      END;

      CREATE TRIGGER trg_range_safety_lane_clearances_no_delete
      BEFORE DELETE ON range_safety_lane_clearances
      BEGIN
        SELECT RAISE(ABORT, 'Range safety Lane clearances are append-only');
      END;
    `);
  },
};
