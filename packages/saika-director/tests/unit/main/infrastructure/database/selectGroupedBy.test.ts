import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import { selectGroupedBy } from '@/main/infrastructure/database/selectGroupedBy';

interface Row {
  parent_id: string;
  label: string;
}

describe('selectGroupedBy', () => {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE children (parent_id TEXT NOT NULL, label TEXT NOT NULL, position INTEGER NOT NULL);
    INSERT INTO children VALUES ('a', 'a2', 2), ('b', 'b1', 1), ('a', 'a1', 1), ('c', 'c1', 1);`);

  const select = (ids: readonly string[]) =>
    selectGroupedBy(
      db,
      ids,
      (placeholders) => `SELECT * FROM children WHERE parent_id IN (${placeholders}) ORDER BY position, label`,
      (row: Row) => row.parent_id,
      (row) => row.label,
    );

  it('groups the requested parents in query order and keeps parents without rows', () => {
    expect([...select(['a', 'b', 'missing']).entries()]).toEqual([
      ['a', ['a1', 'a2']],
      ['b', ['b1']],
      ['missing', []],
    ]);
  });

  it('returns an empty map without querying when no parent is requested', () => {
    expect(select([]).size).toBe(0);
  });
});
