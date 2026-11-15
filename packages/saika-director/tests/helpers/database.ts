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

type Row = Record<string, string | number | null>;

function insert(database: Database.Database, table: string, row: Row): void {
  const columns = Object.keys(row);
  database
    .prepare(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`)
    .run(...Object.values(row));
}

/** Inserts exactly the given columns; omitted columns keep their schema defaults. */
export function seedChampionship(
  database: Database.Database,
  row: { id: string; name: string; date?: string | null; venue?: string | null },
): void {
  insert(database, 'championships', row);
}

/** Inserts exactly the given columns; omitted columns keep their schema defaults. */
export function seedEvent(
  database: Database.Database,
  row: { id: string; championship_id: string; name: string } & Row,
): void {
  insert(database, 'events', row);
}

/** Inserts exactly the given columns; omitted columns keep their schema defaults. */
export function seedParticipant(
  database: Database.Database,
  row: { id: string; event_id: string; player_name: string } & Row,
): void {
  insert(database, 'participants', row);
}
