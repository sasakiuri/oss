// SPDX-License-Identifier: MIT
import type { Migration } from './Migration';

export const migration014: Migration = {
  version: 14,
  name: 'malfunction_signals',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS qualification_malfunction_signal_events (
        id TEXT PRIMARY KEY,
        signal_id TEXT NOT NULL,
        event_type TEXT NOT NULL CHECK(event_type IN ('SIGNALLED', 'CLEARED')),
        competition_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        participant_id TEXT NOT NULL,
        participant_name TEXT NOT NULL,
        start_number TEXT,
        phase TEXT NOT NULL CHECK(phase IN ('SIGHTING', 'MATCH')),
        stage_index INTEGER NOT NULL CHECK(stage_index >= 0),
        series_index INTEGER NOT NULL CHECK(series_index >= 0),
        series_shot_limit INTEGER CHECK(series_shot_limit > 0),
        recorded_shots INTEGER NOT NULL CHECK(recorded_shots >= 0),
        timed_target_program_id TEXT,
        exposure_index INTEGER CHECK(exposure_index >= 0),
        message TEXT CHECK(message IS NULL OR length(message) <= 500),
        signalled_at TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        cleared_by TEXT,
        recorded_at TEXT NOT NULL,
        UNIQUE(signal_id, event_type),
        CHECK(series_shot_limit IS NULL OR recorded_shots <= series_shot_limit),
        CHECK(exposure_index IS NULL OR timed_target_program_id IS NOT NULL),
        CHECK(
          (event_type = 'SIGNALLED' AND cleared_by IS NULL) OR
          (event_type = 'CLEARED' AND cleared_by IS NOT NULL)
        )
      );

      CREATE INDEX IF NOT EXISTS idx_qualification_malfunction_signal_events_current
        ON qualification_malfunction_signal_events(recorded_at, signal_id);

      CREATE TRIGGER IF NOT EXISTS trg_qualification_malfunction_signal_clear_requires_active
      BEFORE INSERT ON qualification_malfunction_signal_events
      WHEN NEW.event_type = 'CLEARED'
      BEGIN
        SELECT CASE WHEN NOT EXISTS (
          SELECT 1 FROM qualification_malfunction_signal_events
          WHERE signal_id = NEW.signal_id AND event_type = 'SIGNALLED'
        ) THEN RAISE(ABORT, 'Qualification malfunction clearance requires a declaration') END;
      END;

      CREATE TRIGGER IF NOT EXISTS trg_qualification_malfunction_signal_events_no_update
      BEFORE UPDATE ON qualification_malfunction_signal_events
      BEGIN
        SELECT RAISE(ABORT, 'Qualification malfunction signal events are append-only');
      END;

      CREATE TRIGGER IF NOT EXISTS trg_qualification_malfunction_signal_events_no_delete
      BEFORE DELETE ON qualification_malfunction_signal_events
      BEGIN
        SELECT RAISE(ABORT, 'Qualification malfunction signal events are append-only');
      END;
    `);
  },
};
