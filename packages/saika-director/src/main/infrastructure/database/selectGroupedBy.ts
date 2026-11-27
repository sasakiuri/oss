// SPDX-License-Identifier: MIT
import type Database from 'better-sqlite3';

/**
 * Runs `sql` for the parent IDs and groups the mapped rows by `parentKey`, keeping the query order.
 * `sql` receives the placeholder list for its `IN (...)` clause. Every requested ID has an entry,
 * empty when the query returned no row for it.
 */
export function selectGroupedBy<TRow, TValue>(
  db: Database.Database,
  ids: readonly string[],
  sql: (placeholders: string) => string,
  parentKey: (row: TRow) => string,
  map: (row: TRow) => TValue,
): Map<string, TValue[]> {
  const result = new Map(ids.map((id) => [id, [] as TValue[]]));
  if (ids.length === 0) return result;
  const rows = db.prepare(sql(ids.map(() => '?').join(', '))).all(...ids) as TRow[];
  for (const row of rows) result.get(parentKey(row))?.push(map(row));
  return result;
}
