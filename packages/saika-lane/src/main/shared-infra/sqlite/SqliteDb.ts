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
      observationId TEXT,
      targetProfileId TEXT,
      scoringGaugeProfileId TEXT
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

  if (currentVersion < 6) {
    db.transaction(() => {
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
    })();
    db.pragma('user_version = 6');
  }

  if (currentVersion < 7) {
    db.transaction(() => {
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
    })();
    db.pragma('user_version = 7');
  }

  if (currentVersion < 8) {
    db.transaction(() => {
      db.exec(`
        ALTER TABLE competition_shoot_off_shot_outbox RENAME TO competition_shoot_off_shot_outbox_v7;

        CREATE TABLE competition_shoot_off_shot_outbox (
          shot_id TEXT PRIMARY KEY,
          competition_id TEXT NOT NULL,
          run_id TEXT NOT NULL,
          iteration INTEGER NOT NULL CHECK(iteration > 0),
          lane_id TEXT NOT NULL,
          payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
          created_at TEXT NOT NULL,
          published_at TEXT
        );

        INSERT INTO competition_shoot_off_shot_outbox
        SELECT * FROM competition_shoot_off_shot_outbox_v7;

        DROP TABLE competition_shoot_off_shot_outbox_v7;

        CREATE INDEX idx_competition_shoot_off_shot_pending
          ON competition_shoot_off_shot_outbox(published_at, created_at, shot_id);
        CREATE INDEX idx_competition_shoot_off_shot_round
          ON competition_shoot_off_shot_outbox(run_id, iteration, lane_id, created_at, shot_id);
      `);
    })();
    db.pragma('user_version = 8');
  }

  if (currentVersion < 9) {
    db.transaction(() => {
      const shotColumns = db.prepare('PRAGMA table_info(shots)').all() as { name: string }[];
      const columnNames = new Set(shotColumns.map((column) => column.name));
      if (!columnNames.has('targetProfileId')) {
        db.exec('ALTER TABLE shots ADD COLUMN targetProfileId TEXT');
      }
      if (!columnNames.has('scoringGaugeProfileId')) {
        db.exec('ALTER TABLE shots ADD COLUMN scoringGaugeProfileId TEXT');
      }
    })();
    db.pragma('user_version = 9');
  }

  if (currentVersion < 10) {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS qualification_recovery_run_events (
          id TEXT PRIMARY KEY,
          run_id TEXT NOT NULL,
          competition_id TEXT NOT NULL,
          event_type TEXT NOT NULL CHECK(event_type IN (
            'STARTED', 'SHOT_RECORDED', 'COMPLETED', 'CANCELLED'
          )),
          start_json TEXT CHECK(start_json IS NULL OR json_valid(start_json)),
          shot_id TEXT,
          observation_id TEXT,
          reason TEXT,
          occurred_at TEXT NOT NULL,
          recorded_at TEXT NOT NULL,
          CHECK (
            (event_type = 'STARTED' AND start_json IS NOT NULL AND shot_id IS NULL AND reason IS NULL) OR
            (event_type = 'SHOT_RECORDED' AND start_json IS NULL AND shot_id IS NOT NULL AND reason IS NULL) OR
            (event_type IN ('COMPLETED', 'CANCELLED') AND start_json IS NULL AND shot_id IS NULL AND reason IS NOT NULL)
          )
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_qualification_recovery_run_started
          ON qualification_recovery_run_events(run_id) WHERE event_type = 'STARTED';
        CREATE UNIQUE INDEX IF NOT EXISTS idx_qualification_recovery_run_shot
          ON qualification_recovery_run_events(run_id, shot_id) WHERE event_type = 'SHOT_RECORDED';
        CREATE UNIQUE INDEX IF NOT EXISTS idx_qualification_recovery_run_terminal
          ON qualification_recovery_run_events(run_id) WHERE event_type IN ('COMPLETED', 'CANCELLED');
        CREATE INDEX IF NOT EXISTS idx_qualification_recovery_run_competition
          ON qualification_recovery_run_events(competition_id, recorded_at, run_id);

        CREATE TRIGGER IF NOT EXISTS trg_qualification_recovery_run_events_no_update
        BEFORE UPDATE ON qualification_recovery_run_events
        BEGIN
          SELECT RAISE(ABORT, 'Qualification recovery run events are append-only');
        END;

        CREATE TRIGGER IF NOT EXISTS trg_qualification_recovery_run_events_no_delete
        BEFORE DELETE ON qualification_recovery_run_events
        BEGIN
          SELECT RAISE(ABORT, 'Qualification recovery run events are append-only');
        END;
      `);
    })();
    db.pragma('user_version = 10');
  }

  if (currentVersion < 11) {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS qualification_recovery_shot_outbox (
          shot_id TEXT PRIMARY KEY,
          competition_id TEXT NOT NULL,
          run_id TEXT NOT NULL,
          lane_id TEXT NOT NULL,
          payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
          created_at TEXT NOT NULL,
          published_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_qualification_recovery_shot_pending
          ON qualification_recovery_shot_outbox(published_at, created_at, shot_id);
        CREATE INDEX IF NOT EXISTS idx_qualification_recovery_shot_run
          ON qualification_recovery_shot_outbox(run_id, lane_id, created_at, shot_id);
      `);
    })();
    db.pragma('user_version = 11');
  }

  if (currentVersion < 12) {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS qualification_recovery_adjudications (
          id TEXT PRIMARY KEY,
          run_id TEXT NOT NULL UNIQUE,
          competition_id TEXT NOT NULL,
          session_id TEXT NOT NULL,
          decision_id TEXT NOT NULL,
          interruption_id TEXT NOT NULL,
          treatment TEXT NOT NULL CHECK(treatment IN (
            'ANNUL_AND_REPEAT', 'COMPLETE_REMAINING_SHOTS'
          )),
          stage_index INTEGER NOT NULL CHECK(stage_index >= 0),
          series_index INTEGER NOT NULL CHECK(series_index >= 0),
          session_series_number INTEGER NOT NULL CHECK(session_series_number > 0),
          expected_recorded_shots INTEGER NOT NULL CHECK(expected_recorded_shots >= 0),
          authorized_shots INTEGER NOT NULL CHECK(authorized_shots > 0),
          decision_official_name TEXT NOT NULL,
          decision_rule_reference TEXT NOT NULL,
          decided_at TEXT NOT NULL,
          applied_by TEXT NOT NULL,
          statement TEXT NOT NULL,
          applied_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_qualification_recovery_adjudications_competition
          ON qualification_recovery_adjudications(competition_id, applied_at, id);

        CREATE TABLE IF NOT EXISTS qualification_recovery_adjudication_shots (
          adjudication_id TEXT NOT NULL REFERENCES qualification_recovery_adjudications(id),
          shot_id TEXT NOT NULL,
          disposition TEXT NOT NULL CHECK(disposition IN (
            'PRESERVED_ORIGINAL', 'ANNULLED_ORIGINAL', 'CREDITED_RECOVERY', 'CREDITED_MISS'
          )),
          shot_snapshot_json TEXT NOT NULL CHECK(json_valid(shot_snapshot_json)),
          PRIMARY KEY(adjudication_id, shot_id)
        );

        CREATE INDEX IF NOT EXISTS idx_qualification_recovery_adjudication_shots_projection
          ON qualification_recovery_adjudication_shots(shot_id, disposition);

        CREATE TRIGGER IF NOT EXISTS trg_qualification_recovery_adjudications_no_update
        BEFORE UPDATE ON qualification_recovery_adjudications
        BEGIN
          SELECT RAISE(ABORT, 'Qualification recovery adjudications are immutable');
        END;

        CREATE TRIGGER IF NOT EXISTS trg_qualification_recovery_adjudications_no_delete
        BEFORE DELETE ON qualification_recovery_adjudications
        BEGIN
          SELECT RAISE(ABORT, 'Qualification recovery adjudications are immutable');
        END;

        CREATE TRIGGER IF NOT EXISTS trg_qualification_recovery_adjudication_shots_no_update
        BEFORE UPDATE ON qualification_recovery_adjudication_shots
        BEGIN
          SELECT RAISE(ABORT, 'Qualification recovery adjudication shots are append-only');
        END;

        CREATE TRIGGER IF NOT EXISTS trg_qualification_recovery_adjudication_shots_no_delete
        BEFORE DELETE ON qualification_recovery_adjudication_shots
        BEGIN
          SELECT RAISE(ABORT, 'Qualification recovery adjudication shots are append-only');
        END;
      `);
    })();
    db.pragma('user_version = 12');
  }

  if (currentVersion < 13) {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS qualification_recovery_settlements (
          id TEXT PRIMARY KEY,
          decision_id TEXT NOT NULL UNIQUE,
          competition_id TEXT NOT NULL,
          session_id TEXT NOT NULL,
          interruption_id TEXT NOT NULL,
          treatment TEXT NOT NULL CHECK(treatment = 'KEEP_RECORDED_SERIES'),
          stage_index INTEGER NOT NULL CHECK(stage_index >= 0),
          series_index INTEGER NOT NULL CHECK(series_index >= 0),
          session_series_number INTEGER NOT NULL CHECK(session_series_number > 0),
          expected_match_program_id TEXT NOT NULL,
          expected_series_shot_limit INTEGER NOT NULL CHECK(expected_series_shot_limit > 0),
          expected_recorded_shots INTEGER NOT NULL CHECK(expected_recorded_shots = expected_series_shot_limit),
          decision_official_name TEXT NOT NULL,
          decision_rule_reference TEXT NOT NULL,
          decided_at TEXT NOT NULL,
          applied_by TEXT NOT NULL,
          statement TEXT NOT NULL,
          applied_at TEXT NOT NULL,
          recorded_shots_json TEXT NOT NULL CHECK(json_valid(recorded_shots_json))
        );

        CREATE INDEX IF NOT EXISTS idx_qualification_recovery_settlements_competition
          ON qualification_recovery_settlements(competition_id, applied_at, id);

        CREATE TRIGGER IF NOT EXISTS trg_qualification_recovery_settlements_no_update
        BEFORE UPDATE ON qualification_recovery_settlements
        BEGIN
          SELECT RAISE(ABORT, 'Qualification recovery settlements are immutable');
        END;

        CREATE TRIGGER IF NOT EXISTS trg_qualification_recovery_settlements_no_delete
        BEFORE DELETE ON qualification_recovery_settlements
        BEGIN
          SELECT RAISE(ABORT, 'Qualification recovery settlements are immutable');
        END;
      `);
    })();
    db.pragma('user_version = 13');
  }

  return db;
}
