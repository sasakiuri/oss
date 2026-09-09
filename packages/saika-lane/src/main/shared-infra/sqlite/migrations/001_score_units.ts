// SPDX-License-Identifier: MIT
import type { Migration } from './Migration';

export const migration001: Migration = {
  version: 1,
  name: 'score_units',
  up(db) {
    db.exec(`
      UPDATE shots SET score = ROUND(score * 10) WHERE score <= 11;
      UPDATE shots SET deviceScore = ROUND(deviceScore * 10) WHERE deviceScore IS NOT NULL AND deviceScore <= 11;
    `);
  },
};
