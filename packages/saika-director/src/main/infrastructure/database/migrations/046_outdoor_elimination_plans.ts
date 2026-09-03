import type { Migration } from './Migration';

export const migration046OutdoorEliminationPlans: Migration = {
  version: 46,
  name: 'outdoor_elimination_plans',
  up(db) {
    db.exec(`
      CREATE TABLE outdoor_elimination_plans (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL,
        competition_type_id TEXT NOT NULL,
        rule_pack_id TEXT NOT NULL,
        rule_pack_schema_version INTEGER NOT NULL CHECK (rule_pack_schema_version = 1),
        rule_pack_fingerprint_sha256 TEXT NOT NULL
          CHECK (
            rule_pack_fingerprint_sha256 NOT GLOB '*[^0-9a-f]*'
            AND length(rule_pack_fingerprint_sha256) = 64
          ),
        source_hash TEXT NOT NULL
          CHECK (source_hash NOT GLOB '*[^0-9a-f]*' AND length(source_hash) = 64),
        input_json TEXT NOT NULL CHECK (json_valid(input_json)),
        projection_json TEXT NOT NULL CHECK (json_valid(projection_json)),
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE outdoor_elimination_plan_entries (
        id TEXT PRIMARY KEY,
        plan_id TEXT NOT NULL REFERENCES outdoor_elimination_plans(id),
        entry_type TEXT NOT NULL CHECK (entry_type IN ('APPROVED', 'QUOTAS_ANNOUNCED', 'VOID')),
        official_name TEXT NOT NULL,
        statement TEXT NOT NULL,
        recorded_at TEXT NOT NULL
      );

      CREATE INDEX idx_outdoor_elimination_plans_event
        ON outdoor_elimination_plans(event_id, created_at, id);
      CREATE INDEX idx_outdoor_elimination_plan_entries_plan
        ON outdoor_elimination_plan_entries(plan_id, recorded_at, id);

      CREATE TRIGGER trg_outdoor_elimination_plans_no_update
      BEFORE UPDATE ON outdoor_elimination_plans
      BEGIN SELECT RAISE(ABORT, 'Outdoor Elimination plans are append-only'); END;
      CREATE TRIGGER trg_outdoor_elimination_plans_no_delete
      BEFORE DELETE ON outdoor_elimination_plans
      BEGIN SELECT RAISE(ABORT, 'Outdoor Elimination plans are append-only'); END;
      CREATE TRIGGER trg_outdoor_elimination_plan_entries_no_update
      BEFORE UPDATE ON outdoor_elimination_plan_entries
      BEGIN SELECT RAISE(ABORT, 'Outdoor Elimination plan entries are append-only'); END;
      CREATE TRIGGER trg_outdoor_elimination_plan_entries_no_delete
      BEFORE DELETE ON outdoor_elimination_plan_entries
      BEGIN SELECT RAISE(ABORT, 'Outdoor Elimination plan entries are append-only'); END;
    `);
  },
};
