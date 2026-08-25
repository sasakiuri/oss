import type Database from 'better-sqlite3';
import type { Migration } from './Migration';

export class MigrationRunner {
  constructor(private readonly db: Database.Database) {}

  getCurrentVersion(): number {
    this.db.exec(`CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
    const row = this.db.prepare(`SELECT value FROM schema_meta WHERE key = 'version'`).get() as
      { value: string } | undefined;
    if (!row) return 0;
    if (!/^(0|[1-9]\d*)$/.test(row.value)) {
      throw new Error(`Invalid database schema version: ${JSON.stringify(row.value)}`);
    }
    const version = Number(row.value);
    if (!Number.isSafeInteger(version)) {
      throw new Error(`Invalid database schema version: ${JSON.stringify(row.value)}`);
    }
    return version;
  }

  run(migrations: Migration[]): void {
    const currentVersion = this.getCurrentVersion();
    const sorted = [...migrations].sort((a, b) => a.version - b.version);
    const latestSupportedVersion = sorted.at(-1)?.version ?? 0;
    if (currentVersion > latestSupportedVersion) {
      throw new Error(
        `Database schema version ${currentVersion} is newer than the latest supported version ${latestSupportedVersion}`,
      );
    }
    const requiresLegacyReset = currentVersion > 0 && currentVersion < 3;
    const migrationBaseVersion = requiresLegacyReset ? 0 : currentVersion;

    const pending = sorted.filter((m) => m.version > migrationBaseVersion);

    if (!requiresLegacyReset && pending.length === 0) return;

    this.db.transaction(() => {
      // Legacy destructive: databases older than v3 are incompatible. Keep the
      // reset in the same transaction as the replacement migrations so a
      // failed migration cannot leave the existing database erased.
      if (requiresLegacyReset) {
        this.db.exec(`
          DROP TABLE IF EXISTS results;
          DROP TABLE IF EXISTS firing_point_assignments;
          DROP TABLE IF EXISTS participants;
          DROP TABLE IF EXISTS entries;
          DROP TABLE IF EXISTS events;
          DROP TABLE IF EXISTS championships;
          DROP TABLE IF EXISTS tournaments;
        `);
        this.setVersion(0);
      }

      for (const migration of pending) {
        migration.up(this.db);
        this.setVersion(migration.version);
      }
    })();
  }

  private setVersion(version: number): void {
    this.db
      .prepare(
        `INSERT INTO schema_meta (key, value) VALUES ('version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(String(version));
  }
}
