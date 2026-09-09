// SPDX-License-Identifier: MIT
import Database from 'better-sqlite3';

import { allMigrations } from './migrations';
import { MigrationRunner } from './migrations/MigrationRunner';

/** Open and migrate a Lane database. The caller owns the returned connection. */
export function createSqliteDb(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  try {
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    new MigrationRunner(db).run(allMigrations);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
