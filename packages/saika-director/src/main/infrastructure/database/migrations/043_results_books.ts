import type { Migration } from './Migration';

export const migration043ResultsBooks: Migration = {
  version: 43,
  name: 'results_books',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS championship_official_entries (
        id TEXT PRIMARY KEY,
        championship_id TEXT NOT NULL REFERENCES championships(id),
        operation TEXT NOT NULL CHECK (operation IN ('APPOINT', 'REVOKE')),
        role TEXT NOT NULL CHECK (role IN (
          'TECHNICAL_DELEGATE', 'RTS_JURY_CHAIR', 'COMPETITION_JURY_CHAIR',
          'EQUIPMENT_CONTROL_JURY_CHAIR', 'RANGE_JURY_CHAIR', 'RTS_OFFICER',
          'RANGE_OFFICER', 'ORGANIZING_COMMITTEE', 'OTHER'
        )),
        official_name TEXT NOT NULL,
        organization TEXT,
        statement TEXT NOT NULL,
        recorded_by TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        reverses_entry_id TEXT REFERENCES championship_official_entries(id),
        CHECK (
          (operation = 'APPOINT' AND reverses_entry_id IS NULL)
          OR (operation = 'REVOKE' AND reverses_entry_id IS NOT NULL)
        )
      );
      CREATE INDEX IF NOT EXISTS idx_championship_official_entries
        ON championship_official_entries(championship_id, recorded_at, id);
      CREATE UNIQUE INDEX IF NOT EXISTS uq_championship_official_revocation
        ON championship_official_entries(reverses_entry_id) WHERE reverses_entry_id IS NOT NULL;

      CREATE TABLE IF NOT EXISTS record_claims (
        id TEXT PRIMARY KEY,
        championship_id TEXT NOT NULL REFERENCES championships(id),
        event_id TEXT NOT NULL REFERENCES events(id),
        result_id TEXT NOT NULL,
        result_scope TEXT NOT NULL CHECK (result_scope IN ('QUALIFICATION', 'FINAL')),
        source_json TEXT NOT NULL CHECK (json_valid(source_json)),
        record_code TEXT NOT NULL CHECK (record_code IN (
          'WR', 'QWR', 'EWR', 'EQWR', 'WRJ', 'QWRJ', 'EWRJ', 'EQWRJ',
          'OR', 'EOR', 'QOR', 'EQOR'
        )),
        result_basis TEXT NOT NULL CHECK (result_basis IN (
          'QUALIFICATION_OR_ELIMINATION', 'FINAL', 'RECOGNIZED_NO_FINAL_TOTAL'
        )),
        benchmark_score_x10 INTEGER NOT NULL CHECK (benchmark_score_x10 >= 0),
        rule_reference TEXT NOT NULL,
        claimed_by TEXT NOT NULL,
        achieved_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_record_claims_championship
        ON record_claims(championship_id, achieved_at, id);
      CREATE INDEX IF NOT EXISTS idx_record_claims_source
        ON record_claims(championship_id, event_id, result_id, result_scope, record_code);

      CREATE TABLE IF NOT EXISTS record_claim_entries (
        id TEXT PRIMARY KEY,
        claim_id TEXT NOT NULL REFERENCES record_claims(id),
        entry_type TEXT NOT NULL CHECK (entry_type IN (
          'TD_CONFIRMED', 'SUBMITTED', 'TECHNICAL_COMMITTEE_VERIFIED',
          'REJECTED', 'REOPENED', 'VOID'
        )),
        statement TEXT NOT NULL,
        official_name TEXT NOT NULL,
        appointment_id TEXT,
        reference TEXT,
        recorded_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_record_claim_entries
        ON record_claim_entries(claim_id, recorded_at, id);

      CREATE TABLE IF NOT EXISTS results_book_versions (
        id TEXT PRIMARY KEY,
        championship_id TEXT NOT NULL REFERENCES championships(id),
        version_number INTEGER NOT NULL CHECK (version_number > 0),
        source_hash TEXT NOT NULL CHECK (length(source_hash) = 64),
        content_json TEXT NOT NULL CHECK (json_valid(content_json)),
        findings_json TEXT NOT NULL CHECK (json_valid(findings_json)),
        required_signers_json TEXT NOT NULL CHECK (json_valid(required_signers_json)),
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE (championship_id, version_number)
      );
      CREATE INDEX IF NOT EXISTS idx_results_book_versions_championship
        ON results_book_versions(championship_id, version_number, created_at, id);

      CREATE TABLE IF NOT EXISTS results_book_signatures (
        id TEXT PRIMARY KEY,
        book_id TEXT NOT NULL REFERENCES results_book_versions(id),
        appointment_id TEXT NOT NULL,
        role TEXT NOT NULL,
        official_name TEXT NOT NULL,
        statement TEXT NOT NULL,
        signed_at TEXT NOT NULL,
        UNIQUE (book_id, appointment_id)
      );
      CREATE INDEX IF NOT EXISTS idx_results_book_signatures_book
        ON results_book_signatures(book_id, signed_at, id);

      CREATE TABLE IF NOT EXISTS results_book_finalizations (
        id TEXT PRIMARY KEY,
        book_id TEXT NOT NULL UNIQUE REFERENCES results_book_versions(id),
        source_hash TEXT NOT NULL CHECK (length(source_hash) = 64),
        statement TEXT NOT NULL,
        official_name TEXT NOT NULL,
        finalized_at TEXT NOT NULL
      );

      CREATE TRIGGER IF NOT EXISTS trg_championship_official_entries_no_update BEFORE UPDATE ON championship_official_entries
      BEGIN SELECT RAISE(ABORT, 'Championship official entries are append-only'); END;
      CREATE TRIGGER IF NOT EXISTS trg_championship_official_entries_no_delete BEFORE DELETE ON championship_official_entries
      BEGIN SELECT RAISE(ABORT, 'Championship official entries are append-only'); END;
      CREATE TRIGGER IF NOT EXISTS trg_record_claims_no_update BEFORE UPDATE ON record_claims
      BEGIN SELECT RAISE(ABORT, 'Record claims are append-only'); END;
      CREATE TRIGGER IF NOT EXISTS trg_record_claims_no_delete BEFORE DELETE ON record_claims
      BEGIN SELECT RAISE(ABORT, 'Record claims are append-only'); END;
      CREATE TRIGGER IF NOT EXISTS trg_record_claim_entries_no_update BEFORE UPDATE ON record_claim_entries
      BEGIN SELECT RAISE(ABORT, 'Record claim entries are append-only'); END;
      CREATE TRIGGER IF NOT EXISTS trg_record_claim_entries_no_delete BEFORE DELETE ON record_claim_entries
      BEGIN SELECT RAISE(ABORT, 'Record claim entries are append-only'); END;
      CREATE TRIGGER IF NOT EXISTS trg_results_book_versions_no_update BEFORE UPDATE ON results_book_versions
      BEGIN SELECT RAISE(ABORT, 'Results Book versions are append-only'); END;
      CREATE TRIGGER IF NOT EXISTS trg_results_book_versions_no_delete BEFORE DELETE ON results_book_versions
      BEGIN SELECT RAISE(ABORT, 'Results Book versions are append-only'); END;
      CREATE TRIGGER IF NOT EXISTS trg_results_book_signatures_no_update BEFORE UPDATE ON results_book_signatures
      BEGIN SELECT RAISE(ABORT, 'Results Book signatures are append-only'); END;
      CREATE TRIGGER IF NOT EXISTS trg_results_book_signatures_no_delete BEFORE DELETE ON results_book_signatures
      BEGIN SELECT RAISE(ABORT, 'Results Book signatures are append-only'); END;
      CREATE TRIGGER IF NOT EXISTS trg_results_book_finalizations_no_update BEFORE UPDATE ON results_book_finalizations
      BEGIN SELECT RAISE(ABORT, 'Results Book finalizations are append-only'); END;
      CREATE TRIGGER IF NOT EXISTS trg_results_book_finalizations_no_delete BEFORE DELETE ON results_book_finalizations
      BEGIN SELECT RAISE(ABORT, 'Results Book finalizations are append-only'); END;
    `);
  },
};
