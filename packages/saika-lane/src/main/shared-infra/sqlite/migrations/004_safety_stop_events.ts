// SPDX-License-Identifier: MIT
import type { Migration } from './Migration';

export const migration004: Migration = {
  version: 4,
  name: 'safety_stop_events',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS lane_safety_stop_events (
        id TEXT PRIMARY KEY,
        safety_stop_id TEXT NOT NULL,
        event_type TEXT NOT NULL CHECK(event_type IN ('STOPPED', 'TIMER_FROZEN', 'CLEARED')),
        reason TEXT NOT NULL,
        official_name TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        competition_id TEXT,
        remaining_seconds INTEGER CHECK(remaining_seconds IS NULL OR remaining_seconds >= 0),
        total_seconds INTEGER CHECK(total_seconds IS NULL OR total_seconds >= 0),
        recorded_at TEXT NOT NULL,
        CHECK (
          event_type != 'TIMER_FROZEN' OR
          (competition_id IS NOT NULL AND remaining_seconds IS NOT NULL AND total_seconds IS NOT NULL)
        )
      );

      CREATE INDEX IF NOT EXISTS idx_lane_safety_stop_events_current
        ON lane_safety_stop_events(recorded_at, safety_stop_id);

      CREATE TRIGGER IF NOT EXISTS trg_lane_safety_stop_events_no_update
      BEFORE UPDATE ON lane_safety_stop_events
      BEGIN
        SELECT RAISE(ABORT, 'Lane safety stop events are append-only');
      END;

      CREATE TRIGGER IF NOT EXISTS trg_lane_safety_stop_events_no_delete
      BEFORE DELETE ON lane_safety_stop_events
      BEGIN
        SELECT RAISE(ABORT, 'Lane safety stop events are append-only');
      END;
    `);
  },
};
