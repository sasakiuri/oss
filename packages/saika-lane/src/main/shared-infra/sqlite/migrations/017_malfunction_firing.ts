// SPDX-License-Identifier: MIT
import type { Migration } from './Migration';

export const migration017: Migration = {
  version: 17,
  name: 'malfunction_firing',
  up(db) {
    db.exec(`
      CREATE TABLE malfunction_firing_runs (
        id TEXT PRIMARY KEY, authorization_id TEXT NOT NULL UNIQUE,
        start_json TEXT NOT NULL CHECK(json_valid(start_json))
      );
      CREATE TABLE malfunction_firing_shots (
        shot_id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES malfunction_firing_runs(id),
        observation_id TEXT UNIQUE, payload TEXT NOT NULL CHECK(json_valid(payload))
      );
      CREATE INDEX idx_malfunction_firing_shots_run ON malfunction_firing_shots(run_id);
      CREATE TABLE malfunction_firing_terminals (
        run_id TEXT PRIMARY KEY REFERENCES malfunction_firing_runs(id),
        status TEXT NOT NULL CHECK(status IN ('COMPLETED', 'CANCELLED')), reason TEXT NOT NULL
      );
    `);
    for (const table of ['malfunction_firing_runs', 'malfunction_firing_shots', 'malfunction_firing_terminals']) {
      db.exec(`CREATE TRIGGER trg_${table}_no_update BEFORE UPDATE ON ${table}
        BEGIN SELECT RAISE(ABORT, 'Malfunction firing evidence is append-only'); END;
        CREATE TRIGGER trg_${table}_no_delete BEFORE DELETE ON ${table}
        BEGIN SELECT RAISE(ABORT, 'Malfunction firing evidence is append-only'); END;`);
    }
  },
};
