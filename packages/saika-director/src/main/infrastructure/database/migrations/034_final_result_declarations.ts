import type { Migration } from './Migration';

export const migration034FinalResultDeclarations: Migration = {
  version: 34,
  name: 'final_result_declarations',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS final_result_declarations (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL UNIQUE REFERENCES events(id),
        snapshot_revision TEXT NOT NULL,
        approval_id TEXT NOT NULL REFERENCES result_list_approval_entries(id),
        final_protests_resolved INTEGER NOT NULL CHECK (final_protests_resolved = 1),
        result_process_confirmed INTEGER NOT NULL CHECK (result_process_confirmed = 1),
        statement TEXT NOT NULL,
        official_name TEXT NOT NULL,
        rule_reference TEXT NOT NULL,
        declared_at TEXT NOT NULL
      );

      CREATE TRIGGER IF NOT EXISTS trg_final_result_declarations_no_update
      BEFORE UPDATE ON final_result_declarations
      BEGIN
        SELECT RAISE(ABORT, 'Final result declarations are append-only');
      END;

      CREATE TRIGGER IF NOT EXISTS trg_final_result_declarations_no_delete
      BEFORE DELETE ON final_result_declarations
      BEGIN
        SELECT RAISE(ABORT, 'Final result declarations are append-only');
      END;

      CREATE TRIGGER IF NOT EXISTS trg_protect_final_declaration_event_delete
      BEFORE DELETE ON events
      WHEN EXISTS (
        SELECT 1 FROM final_result_declarations WHERE event_id = OLD.id
      )
      BEGIN
        SELECT RAISE(ABORT, 'Cannot delete an event with a Final result declaration');
      END;

      CREATE TRIGGER IF NOT EXISTS trg_protect_final_declaration_event_type
      BEFORE UPDATE OF event_type ON events
      WHEN OLD.event_type <> NEW.event_type AND EXISTS (
        SELECT 1 FROM final_result_declarations WHERE event_id = OLD.id
      )
      BEGIN
        SELECT RAISE(ABORT, 'Cannot change the type of an event with a Final result declaration');
      END;
    `);
  },
};
