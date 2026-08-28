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
      deviceScore INTEGER,
      calculatedScore INTEGER,
      receivedAt TEXT,
      observationId TEXT
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

  if (currentVersion < 2) {
    db.transaction(() => {
      const shotColumns = db.prepare('PRAGMA table_info(shots)').all() as { name: string }[];
      const columnNames = new Set(shotColumns.map((column) => column.name));
      if (!columnNames.has('calculatedScore')) {
        db.exec('ALTER TABLE shots ADD COLUMN calculatedScore INTEGER');
      }
      if (!columnNames.has('receivedAt')) {
        db.exec('ALTER TABLE shots ADD COLUMN receivedAt TEXT');
      }
      if (!columnNames.has('observationId')) {
        db.exec('ALTER TABLE shots ADD COLUMN observationId TEXT');
      }

      db.exec(`
        CREATE TABLE IF NOT EXISTS shot_observations (
          id TEXT PRIMARY KEY,
          x REAL,
          y REAL,
          device_score_x10 REAL,
          fired_at TEXT NOT NULL,
          received_at TEXT NOT NULL,
          reported_mode TEXT CHECK(reported_mode IN ('SIGHTING', 'MATCH') OR reported_mode IS NULL),
          raw_frame_hex TEXT
        );

        CREATE TABLE IF NOT EXISTS shot_observation_outcomes (
          id TEXT PRIMARY KEY,
          observation_id TEXT NOT NULL REFERENCES shot_observations(id) ON DELETE CASCADE,
          outcome_type TEXT NOT NULL,
          decided_at TEXT NOT NULL,
          session_id TEXT,
          detail TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_shot_observation_outcomes_observation
          ON shot_observation_outcomes(observation_id, decided_at);
        CREATE INDEX IF NOT EXISTS idx_shots_observation ON shots(observationId);
      `);
    })();
    db.pragma('user_version = 2');
  }

  return db;
}
