import type { Migration } from './Migration';

export const migration039StartLists: Migration = {
  version: 39,
  name: 'start_lists',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS start_list_versions (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL REFERENCES events(id),
        version_number INTEGER NOT NULL CHECK (version_number > 0),
        list_kind TEXT NOT NULL CHECK (list_kind IN (
          'PRE_EVENT_TRAINING', 'ELIMINATION', 'QUALIFICATION', 'FINAL', 'OTHER'
        )),
        discipline_group TEXT NOT NULL CHECK (discipline_group IN ('RIFLE_PISTOL', 'SHOTGUN', 'OTHER')),
        distribution_mode TEXT NOT NULL CHECK (distribution_mode IN ('PRINTED', 'PAPERLESS')),
        scheduled_start_at TEXT NOT NULL,
        publication_due_at TEXT NOT NULL,
        source_snapshot_json TEXT NOT NULL CHECK (json_valid(source_snapshot_json)),
        source_hash TEXT NOT NULL,
        findings_json TEXT NOT NULL CHECK (json_valid(findings_json)),
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(event_id, list_kind, version_number)
      );

      CREATE INDEX IF NOT EXISTS idx_start_list_versions_event
        ON start_list_versions(event_id, list_kind, version_number, created_at);

      CREATE TABLE IF NOT EXISTS start_list_entries (
        id TEXT PRIMARY KEY,
        version_id TEXT NOT NULL REFERENCES start_list_versions(id),
        entry_type TEXT NOT NULL CHECK (entry_type IN (
          'CONTENT_APPROVED', 'PAPERLESS_APPROVED', 'DISTRIBUTED', 'VOID', 'WITHDRAWN'
        )),
        official_name TEXT NOT NULL,
        official_role TEXT NOT NULL CHECK (official_role IN (
          'TECHNICAL_DELEGATE', 'RTS_JURY', 'RTS_OFFICER', 'ORGANIZING_COMMITTEE', 'OTHER'
        )),
        statement TEXT NOT NULL,
        channels_json TEXT NOT NULL CHECK (json_valid(channels_json)),
        final_release_basis TEXT CHECK (
          final_release_basis IS NULL OR final_release_basis IN ('PROTESTS_CLEARED', 'NO_QUALIFICATION_IMPACT')
        ),
        recorded_at TEXT NOT NULL,
        CHECK (entry_type = 'DISTRIBUTED' OR (channels_json = '[]' AND final_release_basis IS NULL))
      );

      CREATE UNIQUE INDEX IF NOT EXISTS uq_start_list_content_approval
        ON start_list_entries(version_id) WHERE entry_type = 'CONTENT_APPROVED';
      CREATE UNIQUE INDEX IF NOT EXISTS uq_start_list_paperless_approval
        ON start_list_entries(version_id) WHERE entry_type = 'PAPERLESS_APPROVED';
      CREATE UNIQUE INDEX IF NOT EXISTS uq_start_list_void
        ON start_list_entries(version_id) WHERE entry_type = 'VOID';
      CREATE UNIQUE INDEX IF NOT EXISTS uq_start_list_withdrawal
        ON start_list_entries(version_id) WHERE entry_type = 'WITHDRAWN';
      CREATE INDEX IF NOT EXISTS idx_start_list_entries_version
        ON start_list_entries(version_id, recorded_at, id);

      CREATE TRIGGER IF NOT EXISTS trg_start_list_versions_no_update BEFORE UPDATE ON start_list_versions
      BEGIN SELECT RAISE(ABORT, 'Start List versions are append-only'); END;
      CREATE TRIGGER IF NOT EXISTS trg_start_list_versions_no_delete BEFORE DELETE ON start_list_versions
      BEGIN SELECT RAISE(ABORT, 'Start List versions are append-only'); END;
      CREATE TRIGGER IF NOT EXISTS trg_start_list_entries_no_update BEFORE UPDATE ON start_list_entries
      BEGIN SELECT RAISE(ABORT, 'Start List entries are append-only'); END;
      CREATE TRIGGER IF NOT EXISTS trg_start_list_entries_no_delete BEFORE DELETE ON start_list_entries
      BEGIN SELECT RAISE(ABORT, 'Start List entries are append-only'); END;
    `);
  },
};
