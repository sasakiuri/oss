import type { Migration } from './Migration';

export const migration031SquaddingDraws: Migration = {
  version: 31,
  name: 'squadding_draws',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS squadding_draws (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL,
        competition_type_id TEXT NOT NULL,
        seed TEXT NOT NULL,
        algorithm_version TEXT NOT NULL,
        relay_count INTEGER NOT NULL CHECK (relay_count > 0),
        first_firing_point INTEGER NOT NULL CHECK (first_firing_point > 0),
        firing_point_count INTEGER NOT NULL CHECK (firing_point_count > 0),
        status_section_policy TEXT NOT NULL CHECK (status_section_policy IN ('OFF', 'END_OF_RELAY')),
        participant_snapshot_json TEXT NOT NULL CHECK (json_valid(participant_snapshot_json)),
        participant_snapshot_hash TEXT NOT NULL,
        assignments_json TEXT NOT NULL CHECK (json_valid(assignments_json)),
        output_hash TEXT NOT NULL,
        findings_json TEXT NOT NULL CHECK (json_valid(findings_json)),
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_squadding_draws_event
        ON squadding_draws(event_id, created_at, id);

      CREATE TABLE IF NOT EXISTS squadding_draw_entries (
        id TEXT PRIMARY KEY,
        draw_id TEXT NOT NULL REFERENCES squadding_draws(id),
        entry_type TEXT NOT NULL CHECK (entry_type IN ('APPROVED', 'APPLIED', 'VOID')),
        official_name TEXT NOT NULL,
        statement TEXT NOT NULL,
        recorded_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_squadding_draw_entries_once
        ON squadding_draw_entries(draw_id, entry_type);
      CREATE INDEX IF NOT EXISTS idx_squadding_draw_entries_draw
        ON squadding_draw_entries(draw_id, recorded_at, id);

      CREATE TRIGGER IF NOT EXISTS trg_squadding_draws_no_update
      BEFORE UPDATE ON squadding_draws
      BEGIN SELECT RAISE(ABORT, 'Squadding draws are append-only'); END;
      CREATE TRIGGER IF NOT EXISTS trg_squadding_draws_no_delete
      BEFORE DELETE ON squadding_draws
      BEGIN SELECT RAISE(ABORT, 'Squadding draws are append-only'); END;
      CREATE TRIGGER IF NOT EXISTS trg_squadding_draw_entries_no_update
      BEFORE UPDATE ON squadding_draw_entries
      BEGIN SELECT RAISE(ABORT, 'Squadding draw entries are append-only'); END;
      CREATE TRIGGER IF NOT EXISTS trg_squadding_draw_entries_no_delete
      BEFORE DELETE ON squadding_draw_entries
      BEGIN SELECT RAISE(ABORT, 'Squadding draw entries are append-only'); END;
    `);
  },
};
