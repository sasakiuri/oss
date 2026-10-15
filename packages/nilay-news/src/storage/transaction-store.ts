// SPDX-License-Identifier: MIT
/**
 * Consistent snapshots and optimistic mutation fencing shared by all stores.
 *
 * Every business mutation reads a transactionally consistent snapshot, then
 * compares its revision and applies the changes in one atomic batch. Each write
 * also checks a unique mutation token: a failed compare cannot write under a
 * newer revision. No process lock, persistent process, or BEGIN is needed.
 */
import type { Article, Clock, Post, Source } from "../domain.ts";
import { UserError } from "../errors.ts";
import { randomToken, utf8 } from "../text.ts";

import { indexArticle } from "./article-content.ts";
import {
  canonical,
  decode,
  encode,
  numberColumn,
  textColumn,
} from "./row-codec.ts";
import type { SQLStatement, SqlDriver } from "./sql.ts";
import type { ArticleScope, StateRows, Table, Tables } from "./state.ts";

const ROW_LIMIT = 1_800_000;

function decodeState(rows: readonly (readonly [string, string])[]): StateRows {
  return Object.fromEntries(
    rows.map(([id, data]) => [id, decode<unknown>(data)]),
  ) as StateRows;
}

function rowsOf(tables: Tables, table: Table): Map<string, unknown> {
  const rows = tables[table];
  return rows instanceof Map
    ? rows
    : new Map<string, unknown>(Object.entries(rows));
}

export interface StorageContext {
  readonly driver: SqlDriver;
  readonly clock: Clock;
  readonly transactions: TransactionStore;
}

/** Every mutation compares the snapshot revision and guards all writes with one unique token. */
export class TransactionStore {
  private readonly driver: SqlDriver;

  constructor(driver: SqlDriver) {
    this.driver = driver;
  }

  async snapshot<K extends Table>(
    tables: readonly K[],
    scope?: ArticleScope,
  ): Promise<[number, Pick<Tables, K>]> {
    return this.load(tables, scope);
  }

  /**
   * Reads the revision and the requested tables in one transactionally
   * consistent batch. `scope` narrows the articles table to those rows, so a
   * mutation neither sees nor writes any other article; listed IDs can also
   * narrow posts.
   */
  async load(
    tables: readonly Table[],
    scope?: ArticleScope,
    scopedPosts = false,
  ): Promise<[number, Tables]> {
    const ids = scope && !("query" in scope) ? scope : undefined;
    const results = await this.driver.batch([
      ["SELECT revision FROM news_meta WHERE id=1", []],
      ...tables.map((table): SQLStatement => {
        if (table === "articles" && scope && "query" in scope)
          return scope.query;
        return (table === "articles" || (table === "posts" && scopedPosts)) &&
          ids
          ? [
              `SELECT id,data FROM news_${table} WHERE id IN (SELECT value FROM json_each(?))`,
              [encode(ids)],
            ]
          : [`SELECT id,data FROM news_${table}`, []];
      }),
    ]);
    const version = numberColumn(results[0]?.results[0], "revision");
    const snapshot: Tables = {
      articles: new Map(),
      sources: new Map(),
      posts: new Map(),
      state: {},
    };
    tables.forEach((table, index) => {
      const rows = (results[index + 1]?.results ?? []).map(
        (row) => [textColumn(row, "id"), textColumn(row, "data")] as const,
      );
      if (table === "state") snapshot.state = decodeState(rows);
      else if (table === "articles")
        snapshot.articles = new Map(
          rows.map(([id, data]) => [id, decode<Article>(data)]),
        );
      else if (table === "sources")
        snapshot.sources = new Map(
          rows.map(([id, data]) => [id, decode<Source>(data)]),
        );
      else
        snapshot.posts = new Map(
          rows.map(([id, data]) => [id, decode<Post>(data)]),
        );
    });
    return [version, snapshot];
  }

  /**
   * Transforms a consistent snapshot and commits its changed rows only if
   * nothing else committed meanwhile, retrying otherwise. A transform may add
   * statements ending in a WHERE clause; they run in the same fenced batch.
   */
  async mutate<K extends Table, R>(
    tables: readonly K[],
    transform: (
      state: Pick<Tables, K>,
      statements: SQLStatement[],
    ) => R | Promise<R>,
    scope?: ArticleScope,
    scopedPosts = false,
  ): Promise<R> {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const [version, after] = await this.load(tables, scope, scopedPosts);
      const before = new Map<Table, Map<string, string>>(
        tables.map((table) => [
          table,
          new Map(
            [...rowsOf(after, table)].map(([id, value]) => [
              id,
              canonical(value),
            ]),
          ),
        ]),
      );
      const statements: SQLStatement[] = [];
      const result = await transform(after, statements);
      if (tables.some((table) => table === "articles"))
        for (const article of after.articles.values()) indexArticle(article);
      // All settings changes, including automatic posting stops,
      // invalidate browser snapshots in the same fenced transaction. Unrelated
      // article, source, job and scheduler writes do not change this token.
      if (
        tables.some((table) => table === "state") &&
        after.state.settings &&
        before.get("state")?.get("settings") !== canonical(after.state.settings)
      )
        after.state.settings_revision = { value: randomToken() };
      const writes: SQLStatement[] = [];
      const token = randomToken();
      const guard = "(SELECT token FROM news_meta WHERE id=1)=?";
      // Group row changes to keep a large ingest/rubric reset within D1's
      // per-invocation query limit. Bound values, never SQL interpolation.
      for (const table of tables) {
        const previous = before.get(table) ?? new Map<string, string>();
        const current = rowsOf(after, table);
        const chunks: { id: string; data: string }[][] = [];
        let chunk: { id: string; data: string }[] = [];
        let size = 0;
        for (const [id, value] of current) {
          if (previous.get(id) === canonical(value)) continue;
          const row = { id, data: encode(value) };
          const rowSize = utf8(encode(row)).length;
          if (rowSize > ROW_LIMIT)
            throw new UserError(
              "保存する記事または処理状態が上限を超えています",
            );
          if (
            chunk.length &&
            (chunk.length === 25 || size + rowSize > ROW_LIMIT)
          ) {
            chunks.push(chunk);
            chunk = [];
            size = 0;
          }
          chunk.push(row);
          size += rowSize + 1;
        }
        if (chunk.length) chunks.push(chunk);
        for (const rows of chunks) {
          writes.push([
            `INSERT INTO news_${table}(id,data) SELECT json_extract(value,'$.id'), json_extract(value,'$.data') FROM json_each(?) ` +
              `WHERE ${guard} ON CONFLICT(id) DO UPDATE SET data=excluded.data`,
            [encode(rows), token],
          ]);
        }
        const removed = [...previous.keys()].filter((id) => !current.has(id));
        if (removed.length) {
          writes.push([
            `DELETE FROM news_${table} WHERE id IN (SELECT value FROM json_each(?)) AND ${guard}`,
            [encode(removed), token],
          ]);
        }
      }
      for (const [sql, values] of statements)
        writes.push([`${sql} AND ${guard}`, [...values, token]]);
      if (!writes.length) return result;
      const results = await this.driver.batch([
        [
          "UPDATE news_meta SET revision=revision+1,token=? WHERE id=1 AND revision=?",
          [token, version],
        ],
        ...writes,
      ]);
      if (results[0]?.meta.changes === 1) return result;
    }
    throw new UserError(
      "同時更新が続いています。時間をおいて再実行してください",
    );
  }

  async stateVersion(): Promise<number> {
    const result = await this.driver.batch([
      ["SELECT revision FROM news_meta WHERE id=1", []],
    ]);
    return numberColumn(result[0]?.results[0], "revision");
  }
}
