import type { Migration } from './Migration';

export const migration044EventRulePackBinding: Migration = {
  version: 44,
  name: 'event_rule_pack_binding',
  up(db) {
    db.exec(`
      ALTER TABLE events ADD COLUMN rule_pack_id TEXT;
      ALTER TABLE events ADD COLUMN rule_pack_schema_version INTEGER
        CHECK (rule_pack_schema_version IS NULL OR rule_pack_schema_version = 1);
      ALTER TABLE events ADD COLUMN rule_pack_fingerprint_sha256 TEXT
        CHECK (
          rule_pack_fingerprint_sha256 IS NULL
          OR rule_pack_fingerprint_sha256 NOT GLOB '*[^0-9a-f]*'
             AND length(rule_pack_fingerprint_sha256) = 64
        );

      CREATE TRIGGER events_rule_pack_binding_insert
      BEFORE INSERT ON events
      WHEN (NEW.rule_pack_id IS NULL) != (NEW.rule_pack_schema_version IS NULL)
        OR (NEW.rule_pack_id IS NULL) != (NEW.rule_pack_fingerprint_sha256 IS NULL)
      BEGIN
        SELECT RAISE(ABORT, 'Event Rule Pack binding must be complete');
      END;

      CREATE TRIGGER events_rule_pack_binding_update
      BEFORE UPDATE OF rule_pack_id, rule_pack_schema_version, rule_pack_fingerprint_sha256 ON events
      WHEN (NEW.rule_pack_id IS NULL) != (NEW.rule_pack_schema_version IS NULL)
        OR (NEW.rule_pack_id IS NULL) != (NEW.rule_pack_fingerprint_sha256 IS NULL)
      BEGIN
        SELECT RAISE(ABORT, 'Event Rule Pack binding must be complete');
      END;
    `);
  },
};
