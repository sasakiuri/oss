// SPDX-License-Identifier: MIT
import type { Migration } from './Migration';

export const migration087FinalResultSourceCompetition: Migration = {
  version: 87,
  name: 'final_result_source_competition',
  up(db) {
    db.exec('ALTER TABLE final_results ADD COLUMN source_competition_id TEXT');
  },
};
