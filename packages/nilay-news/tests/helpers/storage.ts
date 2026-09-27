// SPDX-License-Identifier: MIT
/** Test-only SQLite driver running the exact D1 migration with D1's batch transaction semantics. */
import { readFileSync } from "node:fs";
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

const MIGRATION = readFileSync(
  new URL("../../migrations/0001_news.sql", import.meta.url),
  "utf8",
);

function value(item: SQLOutputValue): SQLValue {
  if (typeof item === "bigint") return Number(item);
  if (item instanceof Uint8Array)
    throw new TypeError("Blob columns are not part of the D1 schema");
  return item;
}

export class SQLiteDriver implements SqlDriver {
  readonly db: DatabaseSync;

  /** A file path lets several drivers act as independent connections to one database. */
  constructor(readonly path = ":memory:") {
    this.db = new DatabaseSync(path, { timeout: 10_000 });
    this.db.exec("PRAGMA foreign_keys=ON");
    this.db.exec(MIGRATION);
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
