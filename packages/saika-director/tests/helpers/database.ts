// SPDX-License-Identifier: MIT
import Database from 'better-sqlite3';

import { allMigrations } from '@/main/infrastructure/database/migrations';
import { MigrationRunner } from '@/main/infrastructure/database/migrations/MigrationRunner';

/** The newest schema version in the migration catalog. */
export const latestMigrationVersion = Math.max(...allMigrations.map((migration) => migration.version));

const templates = new Map<number, Buffer>();

/**
 * Returns a new in-memory database migrated to `upToVersion` (the latest version by default).
 * Vitest isolates module state per test file, so the migrations run once per test file and version;
 * every call deserializes an independent copy of that template.
 */
export function migratedDatabase(upToVersion = latestMigrationVersion): Database.Database {
  let template = templates.get(upToVersion);
  if (!template) {
    if (!allMigrations.some((migration) => migration.version === upToVersion)) {
      throw new Error(`Unknown migration version: ${upToVersion}`);
    }
    const database = new Database(':memory:');
    try {
      new MigrationRunner(database).run(allMigrations.filter((migration) => migration.version <= upToVersion));
      template = database.serialize();
    } finally {
      database.close();
    }
    templates.set(upToVersion, template);
  }
  return new Database(template);
}
