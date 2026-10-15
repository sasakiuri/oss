// SPDX-License-Identifier: MIT
import type { SQLStatement, SqlDriver } from "../../src/storage/sql.ts";

/** Run before each compare-and-write batch; hooks own any once-only race guard. */
export function beforeCommit(
  driver: SqlDriver,
  hook: (statements: SQLStatement[]) => void | Promise<void>,
): () => void {
  const original = driver.batch.bind(driver);
  driver.batch = async (statements) => {
    if (statements[0]?.[0].startsWith("UPDATE news_meta"))
      await hook(statements);
    return original(statements);
  };
  return () => {
    driver.batch = original;
  };
}
