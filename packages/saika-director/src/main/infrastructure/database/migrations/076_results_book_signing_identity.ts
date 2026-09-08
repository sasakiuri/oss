import type { Migration } from './Migration';

export const migration076ResultsBookSigningIdentity: Migration = {
  version: 76,
  name: 'results_book_signing_identity',
  up(db) {
    db.exec(`
      ALTER TABLE championship_official_entries ADD COLUMN official_actor_id TEXT;
      ALTER TABLE results_book_signatures ADD COLUMN signing_evidence_json TEXT
        CHECK(signing_evidence_json IS NULL OR json_valid(signing_evidence_json));
    `);
  },
};
