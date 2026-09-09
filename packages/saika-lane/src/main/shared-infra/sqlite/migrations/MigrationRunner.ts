// SPDX-License-Identifier: MIT
import type Database from 'better-sqlite3';

import type { Migration } from './Migration';
import { createSessionSchema } from './SessionSchema';

/** Owns version bookkeeping and atomic upgrades for Lane's user_version schema. */
export class MigrationRunner {
  constructor(private readonly db: Database.Database) {}

  run(migrations: readonly Migration[]): void {
    migrations.forEach((migration, index) => {
      if (migration.version !== index + 1 || !migration.name.trim()) {
        throw new Error('Lane migrations must have names and consecutive versions starting at 1');
      }
    });

    // Acquire the write lock before reading the version. Schema changes, data
    // conversions and version updates must either all commit or all roll back.
    this.db
      .transaction(() => {
        const currentVersion = this.db.pragma('user_version', { simple: true }) as number;
        const latestVersion = migrations.at(-1)?.version ?? 0;
        if (currentVersion < 0) throw new Error(`Invalid database schema version: ${currentVersion}`);
        if (currentVersion > latestVersion) {
          throw new Error(
            `Database schema version ${currentVersion} is newer than the latest supported version ${latestVersion}`,
          );
        }

        createSessionSchema(this.db);
        for (const migration of migrations) {
          if (migration.version <= currentVersion) continue;
          migration.up(this.db);
          this.db.pragma(`user_version = ${migration.version}`);
        }
      })
      .immediate();
  }
}
