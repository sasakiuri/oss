import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import { migration009ResultSourceCompetition } from '@/main/infrastructure/database/migrations/009_result_source_competition';

describe('migration009ResultSourceCompetition', () => {
  let database: Database.Database | undefined;

  afterEach(() => {
    database?.close();
    database = undefined;
  });

  it('adds nullable competition provenance without changing legacy results', () => {
    database = new Database(':memory:');
    database.exec(`
      CREATE TABLE results (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL,
        relay_number INTEGER NOT NULL
      );
      INSERT INTO results (id, event_id, relay_number)
      VALUES ('result-1', 'event-1', 2);
    `);

    migration009ResultSourceCompetition.up(database);
    migration009ResultSourceCompetition.up(database);

    const columns = database.prepare('PRAGMA table_info(results)').all() as { name: string }[];
    expect(columns.map((column) => column.name)).toContain('source_competition_id');
    expect(database.prepare('SELECT source_competition_id FROM results').get()).toEqual({
      source_competition_id: null,
    });
    expect(database.prepare("PRAGMA index_list('results')").all()).toContainEqual(
      expect.objectContaining({ name: 'idx_results_source_competition' }),
    );
  });
});
