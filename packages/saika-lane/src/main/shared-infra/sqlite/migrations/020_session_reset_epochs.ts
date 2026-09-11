// SPDX-License-Identifier: MIT
import type { Migration } from './Migration';

/** Existing sessions have no reset record until their first committed reset. */
export const migration020: Migration = {
  version: 20,
  name: 'session_reset_epochs',
  up(db) {
    db.exec(`
      CREATE TABLE session_reset_epochs (
        session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
        epoch TEXT NOT NULL CHECK(length(epoch) BETWEEN 1 AND 256)
      );
    `);
  },
};
