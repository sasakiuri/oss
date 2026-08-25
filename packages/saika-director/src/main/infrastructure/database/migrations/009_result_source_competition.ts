import type { Migration } from './Migration';

export const migration009ResultSourceCompetition: Migration = {
  version: 9,
  name: 'result_source_competition',
  up(db) {
    const columns = db.prepare('PRAGMA table_info(results)').all() as { name: string }[];
    if (!columns.some((column) => column.name === 'source_competition_id')) {
      db.exec('ALTER TABLE results ADD COLUMN source_competition_id TEXT');
    }

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_results_source_competition
        ON results(event_id, relay_number, source_competition_id);
    `);
  },
};
