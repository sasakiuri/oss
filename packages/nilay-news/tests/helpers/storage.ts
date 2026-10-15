// SPDX-License-Identifier: MIT
/** Test-only SQLite driver running the exact D1 migrations with D1's batch transaction semantics. */
import { DatabaseSync } from "node:sqlite";
import type { SQLOutputValue } from "node:sqlite";

import { onTestFinished } from "vitest";

import type { Clock } from "../../src/domain.ts";
import type { SourceConfig } from "../../src/sources/types.ts";
import { SQLRepository } from "../../src/storage/sql-repository.ts";
import type {
  SQLResult,
  SQLRow,
  SQLStatement,
  SQLValue,
  SqlDriver,
} from "../../src/storage/sql.ts";
import { MIGRATION_FILES, migration } from "../harness/migrations.ts";

function value(item: SQLOutputValue): SQLValue {
  if (typeof item === "bigint") return Number(item);
  if (item instanceof Uint8Array)
    throw new TypeError("Blob columns are not part of the D1 schema");
  return item;
}

export class SQLiteDriver implements SqlDriver {
  readonly db: DatabaseSync;

  /** A file path lets several drivers act as independent connections to one database. */
  readonly path: string;

  constructor(
    path = ":memory:",
    migrations: readonly string[] = MIGRATION_FILES,
  ) {
    this.path = path;

    this.db = new DatabaseSync(path, { timeout: 10_000 });
    onTestFinished(() => this.close());
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

/** Stored documents for assertions; these readers expose the actual test database rows. */
export async function storedRows(
  repo: SQLRepository,
  table: "articles" | "sources" | "posts",
): Promise<Record<string, unknown>[]> {
  const [result] = await repo.driver.batch([
    [`SELECT data FROM news_${table} ORDER BY id`, []],
  ]);
  return (result?.results ?? []).map(
    (row) => JSON.parse(String(row.data)) as Record<string, unknown>,
  );
}

/** Business rows and state documents, including runtime state, for no-mutation assertions. */
export async function storedState(
  repo: SQLRepository,
): Promise<Record<string, unknown>> {
  const [meta, state, removed] = await repo.driver.batch([
    ["SELECT revision FROM news_meta WHERE id=1", []],
    ["SELECT id,data FROM news_state ORDER BY id", []],
    ["SELECT id FROM news_removed_articles ORDER BY id", []],
  ]);
  return {
    revision: meta?.results[0]?.revision,
    removedArticles: (removed?.results ?? []).map((row) => String(row.id)),
    ...Object.fromEntries(
      (state?.results ?? []).map((row) => [
        String(row.id),
        JSON.parse(String(row.data)) as unknown,
      ]),
    ),
    articles: await storedRows(repo, "articles"),
    sources: await storedRows(repo, "sources"),
    posts: await storedRows(repo, "posts"),
  };
}

/** Seed historical/legacy article documents, then use the production projection backfill. */
export async function seedArticles(
  repo: SQLRepository,
  articles: readonly Record<string, unknown>[],
): Promise<void> {
  await repo.driver.batch(
    articles.map((article) => [
      "INSERT INTO news_articles(id,data) VALUES (?,?)",
      [
        String(article.id),
        JSON.stringify({ ...article, _publicationIndex: 0 }),
      ],
    ]),
  );
  await repo.initialize();
}
