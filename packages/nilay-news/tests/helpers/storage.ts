// SPDX-License-Identifier: MIT
/** Test-only SQLite driver running the exact D1 migrations with D1's batch transaction semantics. */
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import type { SQLOutputValue } from "node:sqlite";

import type { Clock } from "../../src/domain.ts";
import type { SourceConfig } from "../../src/sources/types.ts";
import { SQLRepository } from "../../src/storage/repository.ts";
import type {
  SQLResult,
  SQLRow,
  SQLStatement,
  SQLValue,
  SqlDriver,
} from "../../src/storage/repository.ts";

const MIGRATIONS = new URL("../../migrations/", import.meta.url);
/** Every D1 migration in the order Wrangler applies them. */
export const MIGRATION_FILES = readdirSync(MIGRATIONS)
  .filter((name) => name.endsWith(".sql"))
  .sort();
export function migration(name: string): string {
  return readFileSync(new URL(name, MIGRATIONS), "utf8");
}

function value(item: SQLOutputValue): SQLValue {
  if (typeof item === "bigint") return Number(item);
  if (item instanceof Uint8Array)
    throw new TypeError("Blob columns are not part of the D1 schema");
  return item;
}

export class SQLiteDriver implements SqlDriver {
  readonly db: DatabaseSync;

  /** A file path lets several drivers act as independent connections to one database. */
  constructor(
    readonly path = ":memory:",
    migrations: readonly string[] = MIGRATION_FILES,
  ) {
    this.db = new DatabaseSync(path, { timeout: 10_000 });
    this.db.exec("PRAGMA foreign_keys=ON");
    // Like `wrangler d1 migrations apply`, each migration runs once per database.
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)",
    );
    const applied = this.db.prepare("SELECT 1 FROM d1_migrations WHERE name=?");
    for (const name of migrations) {
      if (applied.get(name)) continue;
      this.db.exec("BEGIN IMMEDIATE");
      try {
        this.db.exec(migration(name));
        this.db.prepare("INSERT INTO d1_migrations(name) VALUES (?)").run(name);
        this.db.exec("COMMIT");
      } catch (error) {
        this.db.exec("ROLLBACK");
        throw error;
      }
    }
  }

  async batch(statements: SQLStatement[]): Promise<SQLResult[]> {
    // Like D1, a batch is one transaction; a leaked transaction would silently merge batches.
    if (this.db.isTransaction)
      throw new Error("A batch must not run inside another transaction");
    const results: SQLResult[] = [];
    this.db.exec("BEGIN IMMEDIATE");
    try {
      for (const [sql, parameters] of statements) {
        const statement = this.db.prepare(sql);
        if (statement.columns().length) {
          const rows = statement
            .all(...parameters)
            .map((row): SQLRow =>
              Object.fromEntries(
                Object.entries(row).map(([key, item]) => [key, value(item)]),
              ),
            );
          results.push({ results: rows, meta: { changes: 0 } });
        } else {
          results.push({
            results: [],
            meta: { changes: Number(statement.run(...parameters).changes) },
          });
        }
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return results;
  }

  close(): void {
    if (this.db.isOpen) this.db.close();
  }
}

export interface TestRepository {
  repo: SQLRepository;
  driver: SQLiteDriver;
  close(): void;
}

/**
 * A repository over a fresh in-memory database, or over `path` for multi-connection tests.
 * Like the D1 factory's constructor, it is not initialized: call `await repo.initialize()`.
 */
export function testRepository(
  sources: SourceConfig[] = [],
  clock?: Clock,
  path?: string,
): TestRepository {
  const driver = new SQLiteDriver(path);
  const repo = new SQLRepository(driver, sources, clock);
  return { repo, driver, close: () => driver.close() };
}
