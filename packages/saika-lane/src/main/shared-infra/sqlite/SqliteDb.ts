// SPDX-License-Identifier: MIT
import Database from 'better-sqlite3';

/**
 * Initialize a SQLite database connection and create tables
 *
 * @param dbPath - Path to the database file (':memory:' for in-memory DB)
 * @returns Initialized Database instance
 */
export function createSqliteDb(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      discipline TEXT NOT NULL,
      mode TEXT NOT NULL,
      startedAt TEXT NOT NULL,
      finishedAt TEXT,
      scoringMode TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS shots (
      id TEXT PRIMARY KEY,
      sessionId TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      shotNumber INTEGER NOT NULL,
      seriesNumber INTEGER NOT NULL,
      impactPointX REAL,
      impactPointY REAL,
      score INTEGER NOT NULL,
      innerTen INTEGER NOT NULL DEFAULT 0,
      timestamp TEXT NOT NULL,
      mode TEXT NOT NULL,
      deviceScore INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_shots_session ON shots(sessionId);
  `);

  // Migration system based on PRAGMA user_version
  const currentVersion = db.pragma('user_version', { simple: true }) as number;

  if (currentVersion < 1) {
    db.transaction(() => {
      db.exec(`
        UPDATE shots SET score = ROUND(score * 10) WHERE score <= 11;
        UPDATE shots SET deviceScore = ROUND(deviceScore * 10) WHERE deviceScore IS NOT NULL AND deviceScore <= 11;
      `);
    })();
    db.pragma('user_version = 1');
  }

  return db;
}
