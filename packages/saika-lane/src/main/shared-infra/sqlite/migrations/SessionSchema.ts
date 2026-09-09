// SPDX-License-Identifier: MIT
import type Database from 'better-sqlite3';

/** The unversioned session schema used by existing Lane databases. */
export function createSessionSchema(db: Database.Database): void {
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
      observationId TEXT,
      targetProfileId TEXT,
      scoringGaugeProfileId TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_shots_session ON shots(sessionId);
  `);
}
