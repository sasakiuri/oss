import type { Migration } from './Migration';

export const migration004AddResultsStatus: Migration = {
  version: 4,
  name: 'add_results_status',
  up(db) {
    const columns = db.prepare(`PRAGMA table_info(results)`).all() as { name: string }[];
    const hasStatusColumn = columns.some((col) => col.name === 'status');

    if (!hasStatusColumn) {
      db.exec(`ALTER TABLE results ADD COLUMN status TEXT DEFAULT 'published'`);
      db.exec(`UPDATE results SET status = 'confirmed' WHERE status = 'published'`);
    }
  },
};
