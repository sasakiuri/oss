// SPDX-License-Identifier: MIT
import type { Migration } from './Migration';

export const migration006: Migration = {
  version: 6,
  name: 'range_officer_requests',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS range_officer_request_events (
        id TEXT PRIMARY KEY,
        request_id TEXT NOT NULL,
        event_type TEXT NOT NULL CHECK(event_type IN ('REQUESTED', 'CLEARED')),
        category TEXT NOT NULL CHECK(category IN (
          'ASSISTANCE', 'EQUIPMENT', 'TARGET', 'SCORING', 'SAFETY', 'OTHER'
        )),
        message TEXT,
        requested_at TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        cleared_by TEXT,
        recorded_at TEXT NOT NULL,
        CHECK (
          (event_type = 'REQUESTED' AND cleared_by IS NULL) OR
          (event_type = 'CLEARED' AND cleared_by IS NOT NULL)
        )
      );

      CREATE INDEX IF NOT EXISTS idx_range_officer_request_events_current
        ON range_officer_request_events(recorded_at, request_id);

      CREATE TRIGGER IF NOT EXISTS trg_range_officer_request_events_no_update
      BEFORE UPDATE ON range_officer_request_events
      BEGIN
        SELECT RAISE(ABORT, 'Range Officer request events are append-only');
      END;

      CREATE TRIGGER IF NOT EXISTS trg_range_officer_request_events_no_delete
      BEFORE DELETE ON range_officer_request_events
      BEGIN
        SELECT RAISE(ABORT, 'Range Officer request events are append-only');
      END;
    `);
  },
};
