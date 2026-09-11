// SPDX-License-Identifier: MIT
import type { Migration } from './Migration';

export const migration086VistaSources: Migration = {
  version: 86,
  name: 'vista_sources',
  up(db) {
    // No foreign keys: displayed competitions survive removal from the live control workspace.
    db.exec(`CREATE TABLE vista_competition_sources (
      id TEXT PRIMARY KEY,
      source_json TEXT NOT NULL CHECK (json_valid(source_json)),
      snapshot_json TEXT CHECK (snapshot_json IS NULL OR json_valid(snapshot_json)),
      revision INTEGER NOT NULL DEFAULT 0
    )`);
  },
};
