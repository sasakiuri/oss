import type { Migration } from './Migration';

export const migration017ResultPublication: Migration = {
  version: 17,
  name: 'result_publication',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS result_publication_entries (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL REFERENCES events(id),
        result_scope TEXT NOT NULL CHECK (result_scope IN ('QUALIFICATION', 'FINAL')),
        entry_type TEXT NOT NULL CHECK (entry_type IN (
          'PRELIMINARY_PUBLISHED',
          'PROTEST_REGISTERED',
          'PROTEST_RESOLVED',
          'OFFICIAL_PUBLISHED'
        )),
        preliminary_id TEXT NOT NULL,
        payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
        recorded_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_result_publication_entries_event
        ON result_publication_entries(event_id, result_scope);
      CREATE UNIQUE INDEX IF NOT EXISTS uq_result_publication_single_official
        ON result_publication_entries(preliminary_id)
        WHERE entry_type = 'OFFICIAL_PUBLISHED';
      CREATE UNIQUE INDEX IF NOT EXISTS uq_result_publication_protest_registration
        ON result_publication_entries(
          preliminary_id,
          json_extract(payload_json, '$.protestReference')
        )
        WHERE entry_type = 'PROTEST_REGISTERED';
      CREATE UNIQUE INDEX IF NOT EXISTS uq_result_publication_protest_resolution
        ON result_publication_entries(
          preliminary_id,
          json_extract(payload_json, '$.protestReference')
        )
        WHERE entry_type = 'PROTEST_RESOLVED';

      CREATE TRIGGER IF NOT EXISTS trg_result_publication_entries_no_update
      BEFORE UPDATE ON result_publication_entries
      BEGIN
        SELECT RAISE(ABORT, 'Result publication entries are append-only');
      END;

      CREATE TRIGGER IF NOT EXISTS trg_result_publication_entries_no_delete
      BEFORE DELETE ON result_publication_entries
      BEGIN
        SELECT RAISE(ABORT, 'Result publication entries are append-only');
      END;

      CREATE TRIGGER IF NOT EXISTS trg_protect_result_publication_event_delete
      BEFORE DELETE ON events
      WHEN EXISTS (
        SELECT 1 FROM result_publication_entries WHERE event_id = OLD.id
      )
      BEGIN
        SELECT RAISE(ABORT, 'Cannot delete an event with result publication history');
      END;

      CREATE TRIGGER IF NOT EXISTS trg_protect_result_publication_event_type
      BEFORE UPDATE OF event_type ON events
      WHEN OLD.event_type <> NEW.event_type AND EXISTS (
        SELECT 1 FROM result_publication_entries WHERE event_id = OLD.id
      )
      BEGIN
        SELECT RAISE(ABORT, 'Cannot change the type of an event with result publication history');
      END;
    `);
  },
};
