import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { migration008UniqueFinalResults } from '@/main/infrastructure/database/migrations/008_unique_final_results';

describe('migration008UniqueFinalResults', () => {
  let database: Database.Database | undefined;

  afterEach(() => {
    database?.close();
    database = undefined;
  });

  it('retains one legacy row and enforces one final result per event participant', () => {
    database = new Database(':memory:');
    database.exec(`
      CREATE TABLE final_results (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL,
        participant_id TEXT NOT NULL
      );
      INSERT INTO final_results (id, event_id, participant_id)
      VALUES
        ('result-1', 'event-1', 'participant-1'),
        ('result-2', 'event-1', 'participant-1');
    `);

    migration008UniqueFinalResults.up(database);

    expect(database.prepare('SELECT id FROM final_results').all()).toEqual([{ id: 'result-1' }]);
    expect(() =>
      database!
        .prepare('INSERT INTO final_results (id, event_id, participant_id) VALUES (?, ?, ?)')
        .run('result-3', 'event-1', 'participant-1'),
    ).toThrow(/UNIQUE constraint failed/);
  });
});
