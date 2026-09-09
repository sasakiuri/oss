// SPDX-License-Identifier: MIT
import type { Migration } from './Migration';

export const migration009: Migration = {
  version: 9,
  name: 'scoring_geometry',
  up(db) {
    const shotColumns = db.prepare('PRAGMA table_info(shots)').all() as { name: string }[];
    const columnNames = new Set(shotColumns.map((column) => column.name));
    if (!columnNames.has('targetProfileId')) {
      db.exec('ALTER TABLE shots ADD COLUMN targetProfileId TEXT');
    }
    if (!columnNames.has('scoringGaugeProfileId')) {
      db.exec('ALTER TABLE shots ADD COLUMN scoringGaugeProfileId TEXT');
    }
  },
};
