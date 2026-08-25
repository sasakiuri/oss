import type { Migration } from './Migration';

export const migration003CreateSchema: Migration = {
  version: 3,
  name: 'create_schema',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS championships (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        date TEXT NOT NULL,
        venue TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        championship_id TEXT NOT NULL REFERENCES championships(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        event_type TEXT NOT NULL,
        round TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS participants (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        player_name TEXT NOT NULL,
        affiliation TEXT NOT NULL DEFAULT '',
        logo_path TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        UNIQUE(event_id, id)
      );

      CREATE TABLE IF NOT EXISTS firing_point_assignments (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL,
        relay_number INTEGER NOT NULL,
        firing_point_number INTEGER NOT NULL,
        participant_id TEXT NOT NULL,
        UNIQUE(event_id, relay_number, firing_point_number),
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
        FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE,
        FOREIGN KEY (event_id, participant_id) REFERENCES participants(event_id, id)
      );

      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS results (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL,
        participant_id TEXT NOT NULL,
        player_name TEXT NOT NULL,
        affiliation TEXT NOT NULL DEFAULT '',
        relay_number INTEGER NOT NULL,
        total_score REAL NOT NULL,
        series1 REAL NOT NULL DEFAULT 0.0,
        series2 REAL NOT NULL DEFAULT 0.0,
        series3 REAL NOT NULL DEFAULT 0.0,
        series4 REAL NOT NULL DEFAULT 0.0,
        series5 REAL NOT NULL DEFAULT 0.0,
        series6 REAL NOT NULL DEFAULT 0.0,
        shots_detail TEXT NOT NULL,
        confirmed_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(event_id, participant_id),
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
        FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE,
        FOREIGN KEY (event_id, participant_id) REFERENCES participants(event_id, id)
      );
    `);
  },
};
