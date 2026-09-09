// SPDX-License-Identifier: MIT
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createSqliteDb } from '@/main/shared-infra/sqlite/SqliteDb';

describe('Lane SQLite initialization', () => {
  let directory: string;
  let file: string;
  const databases: Database.Database[] = [];
  const track = (db: Database.Database) => {
    databases.push(db);
    return db;
  };

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'lane-migrations-'));
    file = join(directory, 'lane.db');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    databases.splice(0).forEach((db) => {
      if (db.open) db.close();
    });
    rmSync(directory, { recursive: true, force: true });
  });

  it('opens a fresh database with the existing schema and connection policies', () => {
    const db = track(createSqliteDb(file));
    expect(db.pragma('user_version', { simple: true })).toBe(19);
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal');
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(db.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });

  it('upgrades legacy score units and columns exactly once while preserving observations', () => {
    const legacy = track(new Database(file));
    legacy.exec(`
      CREATE TABLE sessions (id TEXT PRIMARY KEY, discipline TEXT NOT NULL, mode TEXT NOT NULL,
        startedAt TEXT NOT NULL, finishedAt TEXT, scoringMode TEXT NOT NULL);
      CREATE TABLE shots (id TEXT PRIMARY KEY, sessionId TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        shotNumber INTEGER NOT NULL, seriesNumber INTEGER NOT NULL, impactPointX REAL, impactPointY REAL,
        score REAL NOT NULL, innerTen INTEGER NOT NULL DEFAULT 0, timestamp TEXT NOT NULL, mode TEXT NOT NULL,
        deviceScore REAL);
      INSERT INTO sessions VALUES ('session', 'AIR_RIFLE_10M', 'MATCH', '2026-01-01T00:00:00Z', NULL, 'DECIMAL');
      INSERT INTO shots VALUES ('shot', 'session', 1, 1, 0.5, 0.25, 10.5, 1, '2026-01-01T00:00:01Z', 'MATCH', 10.4);
    `);
    legacy.close();

    const upgraded = track(createSqliteDb(file));
    expect(
      upgraded.prepare('SELECT score, deviceScore, calculatedScore, observationId, targetProfileId FROM shots').get(),
    ).toEqual({
      score: 105,
      deviceScore: 104,
      calculatedScore: null,
      observationId: null,
      targetProfileId: null,
    });
    upgraded.exec(`INSERT INTO shot_observations (id, fired_at, received_at)
      VALUES ('observation', '2026-01-01T00:00:01Z', '2026-01-01T00:00:02Z')`);
    upgraded.close();

    const reopened = track(createSqliteDb(file));
    expect(reopened.prepare('SELECT score, deviceScore FROM shots').get()).toEqual({ score: 105, deviceScore: 104 });
    expect(reopened.prepare('SELECT id, timestamp_source FROM shot_observations').get()).toEqual({
      id: 'observation',
      timestamp_source: 'UNKNOWN',
    });
    expect(reopened.pragma('user_version', { simple: true })).toBe(19);
  });

  it('closes a rejected connection and preserves a database created by a newer application', () => {
    const newer = track(new Database(file));
    newer.exec("CREATE TABLE future_evidence (value TEXT); INSERT INTO future_evidence VALUES ('preserved')");
    newer.pragma('user_version = 20');
    newer.close();
    const close = vi.spyOn(Database.prototype, 'close');

    expect(() => createSqliteDb(file)).toThrow('newer than the latest supported version 19');
    expect(close).toHaveBeenCalledOnce();
    expect((close.mock.contexts[0] as Database.Database).open).toBe(false);
    const preserved = track(new Database(file));
    expect(preserved.prepare('SELECT * FROM future_evidence').all()).toEqual([{ value: 'preserved' }]);
    expect(preserved.pragma('user_version', { simple: true })).toBe(20);
    expect(preserved.prepare("SELECT name FROM sqlite_schema WHERE name = 'sessions'").get()).toBeUndefined();
  });
});
