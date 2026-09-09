// SPDX-License-Identifier: MIT
import type { Migration } from './Migration';

export const migration007: Migration = {
  version: 7,
  name: 'timed_target_events',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS timed_target_sequence_events (
        id TEXT PRIMARY KEY,
        sequence_id TEXT NOT NULL,
        competition_id TEXT NOT NULL,
        event_type TEXT NOT NULL CHECK(event_type IN (
          'STARTED', 'SHOT_ACCEPTED', 'COMPLETED', 'CANCELLED'
        )),
        schedule_json TEXT CHECK(schedule_json IS NULL OR json_valid(schedule_json)),
        observation_id TEXT,
        exposure_index INTEGER CHECK(exposure_index IS NULL OR exposure_index >= 0),
        reason TEXT,
        occurred_at TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        CHECK (
          (event_type = 'STARTED' AND schedule_json IS NOT NULL AND observation_id IS NULL AND exposure_index IS NULL) OR
          (event_type = 'SHOT_ACCEPTED' AND schedule_json IS NULL AND observation_id IS NOT NULL AND exposure_index IS NOT NULL) OR
          (event_type IN ('COMPLETED', 'CANCELLED') AND schedule_json IS NULL AND observation_id IS NULL AND exposure_index IS NULL)
        )
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_timed_target_sequence_started
        ON timed_target_sequence_events(sequence_id) WHERE event_type = 'STARTED';
      CREATE UNIQUE INDEX IF NOT EXISTS idx_timed_target_sequence_observation
        ON timed_target_sequence_events(sequence_id, observation_id) WHERE event_type = 'SHOT_ACCEPTED';
      CREATE UNIQUE INDEX IF NOT EXISTS idx_timed_target_sequence_terminal
        ON timed_target_sequence_events(sequence_id) WHERE event_type IN ('COMPLETED', 'CANCELLED');
      CREATE INDEX IF NOT EXISTS idx_timed_target_sequence_competition
        ON timed_target_sequence_events(competition_id, recorded_at, sequence_id);

      CREATE TRIGGER IF NOT EXISTS trg_timed_target_sequence_events_no_update
      BEFORE UPDATE ON timed_target_sequence_events
      BEGIN
        SELECT RAISE(ABORT, 'Timed target sequence events are append-only');
      END;

      CREATE TRIGGER IF NOT EXISTS trg_timed_target_sequence_events_no_delete
      BEFORE DELETE ON timed_target_sequence_events
      BEGIN
        SELECT RAISE(ABORT, 'Timed target sequence events are append-only');
      END;
    `);
  },
};
