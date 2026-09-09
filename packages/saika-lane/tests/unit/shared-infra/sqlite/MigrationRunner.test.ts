// SPDX-License-Identifier: MIT
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Migration } from '@/main/shared-infra/sqlite/migrations/Migration';
import { MigrationRunner } from '@/main/shared-infra/sqlite/migrations/MigrationRunner';

const first: Migration = {
  version: 1,
  name: 'original',
  up(db) {
    db.exec("CREATE TABLE evidence (id TEXT PRIMARY KEY, value TEXT); INSERT INTO evidence VALUES ('one', 'original')");
  },
};

describe('Lane MigrationRunner', () => {
  let db: Database.Database;
  let runner: MigrationRunner;

  beforeEach(() => {
    db = new Database(':memory:');
    runner = new MigrationRunner(db);
  });
  afterEach(() => db.close());

  it('rolls back the entire pending upgrade and can retry it without losing evidence', () => {
    runner.run([first]);
    const second: Migration = {
      version: 2,
      name: 'extend_evidence',
      up(database) {
        database.exec("ALTER TABLE evidence ADD COLUMN note TEXT; UPDATE evidence SET value = 'updated'");
      },
    };
    const failure = new Error('migration failed');
    const third: Migration = {
      version: 3,
      name: 'index_evidence',
      up(database) {
        database.exec('CREATE INDEX idx_evidence_note ON evidence(note)');
        throw failure;
      },
    };

    expect(() => runner.run([first, second, third])).toThrow(failure);
    expect(db.pragma('user_version', { simple: true })).toBe(1);
    expect(db.prepare('SELECT * FROM evidence').all()).toEqual([{ id: 'one', value: 'original' }]);
    expect(db.prepare("SELECT name FROM sqlite_schema WHERE name = 'idx_evidence_note'").get()).toBeUndefined();

    runner.run([
      first,
      second,
      { ...third, up: (database) => database.exec('CREATE INDEX idx_evidence_note ON evidence(note)') },
    ]);
    expect(db.pragma('user_version', { simple: true })).toBe(3);
    expect(db.prepare('SELECT * FROM evidence').all()).toEqual([{ id: 'one', value: 'updated', note: null }]);
    // Reopening at the current version must not rerun non-idempotent migrations.
    runner.run([first, second, third]);
  });

  it('rolls back session initialization when a fresh database cannot be migrated', () => {
    expect(() =>
      runner.run([
        {
          ...first,
          up: () => {
            throw new Error('failed');
          },
        },
      ]),
    ).toThrow('failed');
    expect(db.pragma('user_version', { simple: true })).toBe(0);
    expect(db.prepare('SELECT name FROM sqlite_schema').all()).toEqual([]);
  });

  it.each([
    [first, first],
    [{ ...first, version: 2 }],
    [{ ...first, version: 0 }],
    [{ ...first, version: 1.5 }],
    [{ ...first, name: ' ' }],
  ])('rejects an invalid catalog before creating tables: %j', (...migrations) => {
    expect(() => runner.run(migrations)).toThrow('consecutive versions');
    expect(db.prepare('SELECT name FROM sqlite_schema').all()).toEqual([]);
  });

  it.each([-1, 2])('rejects unsupported database version %i before changing the schema', (version) => {
    db.pragma(`user_version = ${version}`);
    expect(() => runner.run([first])).toThrow('schema version');
    expect(db.pragma('user_version', { simple: true })).toBe(version);
    expect(db.prepare('SELECT name FROM sqlite_schema').all()).toEqual([]);
  });
});
