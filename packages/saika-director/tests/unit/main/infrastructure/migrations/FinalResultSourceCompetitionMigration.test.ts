// SPDX-License-Identifier: MIT
// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';
import { migration087FinalResultSourceCompetition } from '@/main/infrastructure/database/migrations/087_final_result_source_competition';

it('preserves existing Final results without inventing competition provenance', () => {
  const db = new Database(':memory:');
  try {
    db.exec(
      "CREATE TABLE final_results (id TEXT PRIMARY KEY, total_score REAL); INSERT INTO final_results VALUES ('existing', 240.1)",
    );
    migration087FinalResultSourceCompetition.up(db);
    expect(db.prepare('SELECT * FROM final_results').all()).toEqual([
      { id: 'existing', total_score: 240.1, source_competition_id: null },
    ]);
  } finally {
    db.close();
  }
});
