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

  if (currentVersion < 3) {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS shot_observation_evidence_outbox (
          evidence_id TEXT PRIMARY KEY,
          observation_id TEXT NOT NULL REFERENCES shot_observations(id),
          outcome_id TEXT NOT NULL REFERENCES shot_observation_outcomes(id),
          payload_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          published_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_shot_observation_evidence_pending
          ON shot_observation_evidence_outbox(published_at, created_at, evidence_id);
      `);
    })();
    db.pragma('user_version = 3');
  }

  if (currentVersion < 4) {
    db.transaction(() => {
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
    })();
    db.pragma('user_version = 4');
  }

  if (currentVersion < 5) {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS competition_shoot_off_shot_outbox (
          shot_id TEXT PRIMARY KEY,
          competition_id TEXT NOT NULL,
          run_id TEXT NOT NULL,
          iteration INTEGER NOT NULL CHECK(iteration > 0),
          lane_id TEXT NOT NULL,
          payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
          created_at TEXT NOT NULL,
          published_at TEXT,
          UNIQUE(run_id, iteration, lane_id)
        );

        CREATE INDEX IF NOT EXISTS idx_competition_shoot_off_shot_pending
          ON competition_shoot_off_shot_outbox(published_at, created_at, shot_id);
      `);
    })();
    db.pragma('user_version = 5');
  }

  return db;
}
