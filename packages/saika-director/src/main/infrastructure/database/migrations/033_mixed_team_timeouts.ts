import type { Migration } from './Migration';

export const migration033MixedTeamTimeouts: Migration = {
  version: 33,
  name: 'mixed_team_timeouts',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS mixed_team_timeout_sessions (
        id TEXT PRIMARY KEY,
        competition_id TEXT NOT NULL,
        requesting_team_id TEXT NOT NULL,
        courtesy_team_ids_json TEXT NOT NULL CHECK (json_valid(courtesy_team_ids_json)),
        requested_by_role TEXT NOT NULL CHECK (requested_by_role IN ('COACH', 'ATHLETE')),
        requested_by_name TEXT NOT NULL,
        after_shot INTEGER NOT NULL CHECK (after_shot BETWEEN 1 AND 24),
        duration_seconds INTEGER NOT NULL CHECK (duration_seconds = 30),
        official_name TEXT NOT NULL,
        statement TEXT NOT NULL,
        started_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_mixed_team_timeouts_competition
        ON mixed_team_timeout_sessions(competition_id, started_at, id);

      CREATE TABLE IF NOT EXISTS mixed_team_timeout_entries (
        id TEXT PRIMARY KEY,
        timeout_id TEXT NOT NULL REFERENCES mixed_team_timeout_sessions(id),
        entry_type TEXT NOT NULL CHECK (entry_type IN ('CLOSED', 'VOID')),
        official_name TEXT NOT NULL,
        statement TEXT NOT NULL,
        recorded_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_mixed_team_timeout_entry_once
        ON mixed_team_timeout_entries(timeout_id, entry_type);

      CREATE TRIGGER IF NOT EXISTS trg_mixed_team_timeout_sessions_no_update
      BEFORE UPDATE ON mixed_team_timeout_sessions
      BEGIN SELECT RAISE(ABORT, 'Mixed Team timeout sessions are append-only'); END;
      CREATE TRIGGER IF NOT EXISTS trg_mixed_team_timeout_sessions_no_delete
      BEFORE DELETE ON mixed_team_timeout_sessions
      BEGIN SELECT RAISE(ABORT, 'Mixed Team timeout sessions are append-only'); END;
      CREATE TRIGGER IF NOT EXISTS trg_mixed_team_timeout_entries_no_update
      BEFORE UPDATE ON mixed_team_timeout_entries
      BEGIN SELECT RAISE(ABORT, 'Mixed Team timeout entries are append-only'); END;
      CREATE TRIGGER IF NOT EXISTS trg_mixed_team_timeout_entries_no_delete
      BEFORE DELETE ON mixed_team_timeout_entries
      BEGIN SELECT RAISE(ABORT, 'Mixed Team timeout entries are append-only'); END;
    `);
  },
};
