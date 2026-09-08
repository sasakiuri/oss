import type { Migration } from './Migration';
export const migration081PublicationReviewPolicies: Migration = {
  version: 81,
  name: 'publication_review_policies',
  up(db) {
    db.exec(`CREATE TABLE publication_review_policies (
      id TEXT PRIMARY KEY, event_id TEXT NOT NULL, result_scope TEXT NOT NULL CHECK (result_scope IN ('QUALIFICATION','FINAL')),
      payload_json TEXT NOT NULL CHECK (json_valid(payload_json)));
      CREATE INDEX idx_publication_review_policy_scope ON publication_review_policies(event_id, result_scope);
      CREATE TRIGGER trg_publication_review_policy_no_update BEFORE UPDATE ON publication_review_policies
      BEGIN SELECT RAISE(ABORT, 'Publication review policies are append-only'); END;
      CREATE TRIGGER trg_publication_review_policy_no_delete BEFORE DELETE ON publication_review_policies
      BEGIN SELECT RAISE(ABORT, 'Publication review policies are append-only'); END;`);
  },
};
