import type { Migration } from './Migration';

export const migration071FinalRecoveryFiring: Migration = {
  version: 71,
  name: 'final_recovery_firing',
  up(db) {
    db.exec(`CREATE TABLE final_recovery_firing_runs (id TEXT PRIMARY KEY, case_id TEXT NOT NULL, competition_id TEXT NOT NULL,
      lane_id TEXT NOT NULL, authorization_id TEXT NOT NULL, record_json TEXT NOT NULL CHECK(json_valid(record_json)), UNIQUE(authorization_id, lane_id));
      CREATE INDEX final_firing_case ON final_recovery_firing_runs(case_id);
      CREATE TABLE final_recovery_firing_evidence (id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES final_recovery_firing_runs(id), received_at TEXT NOT NULL, evidence_json TEXT NOT NULL CHECK(json_valid(evidence_json)));
      CREATE INDEX final_firing_evidence_run ON final_recovery_firing_evidence(run_id);`);
    for (const table of ['final_recovery_firing_runs', 'final_recovery_firing_evidence'])
      db.exec(`CREATE TRIGGER ${table}_no_update BEFORE UPDATE ON ${table} BEGIN SELECT RAISE(ABORT, 'Final firing evidence is append-only'); END;
        CREATE TRIGGER ${table}_no_delete BEFORE DELETE ON ${table} BEGIN SELECT RAISE(ABORT, 'Final firing evidence is append-only'); END;`);
  },
};
