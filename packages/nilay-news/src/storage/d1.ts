// SPDX-License-Identifier: MIT
/** The only module which knows the Workers D1 binding API. */
import type { D1Database } from "@cloudflare/workers-types";

import type { Clock } from "../domain.ts";
import type { SourceConfig } from "../sources/types.ts";

import { SQLRepository } from "./sql-repository.ts";
import type { SQLResult, SQLRow, SQLStatement, SqlDriver } from "./sql.ts";

class D1Driver implements SqlDriver {
  private readonly binding: D1Database;

  constructor(binding: D1Database) {
    this.binding = binding;
  }

  async batch(statements: SQLStatement[]): Promise<SQLResult[]> {
    const prepared = statements.map(([sql, parameters]) => {
      const statement = this.binding.prepare(sql);
      return parameters.length ? statement.bind(...parameters) : statement;
    });
    // D1 executes a batch sequentially in one transaction, rolling back all
    // statements if any statement fails. Explicit BEGIN is not supported.
    const results = await this.binding.batch<SQLRow>(prepared);
    return results.map((result) => {
      if (!result.success) throw new Error("データベースの更新に失敗しました");
      return {
        results: result.results,
        meta: { changes: result.meta.changes },
      };
    });
  }
}

export async function createD1Repository(
  binding: D1Database,
  sources: readonly SourceConfig[],
  clock?: Clock,
): Promise<SQLRepository> {
  const repository = new SQLRepository(new D1Driver(binding), sources, clock);
  await repository.initialize();
  return repository;
}
