import type { Migration } from './Migration';
export const migration077ResultApprovalSigningIdentity: Migration = {
  version: 77,
  name: 'result_approval_signing_identity',
  up(db) {
    db.exec(`ALTER TABLE result_list_approval_entries ADD COLUMN signing_evidence_json TEXT
      CHECK(signing_evidence_json IS NULL OR json_valid(signing_evidence_json));`);
  },
};
