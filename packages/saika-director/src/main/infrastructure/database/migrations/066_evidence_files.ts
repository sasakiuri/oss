import type { Migration } from './Migration';
export const migration066EvidenceFiles: Migration = {
  version: 66,
  name: 'evidence_files',
  up(db) {
    db.exec(`CREATE TABLE evidence_files (
      id TEXT PRIMARY KEY,
      evidence_id TEXT NOT NULL REFERENCES target_examination_evidence(id),
      snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json))
    );
    CREATE INDEX evidence_files_by_evidence ON evidence_files(evidence_id);
    CREATE TRIGGER evidence_files_no_update BEFORE UPDATE ON evidence_files
    BEGIN SELECT RAISE(ABORT, 'Evidence files are append-only'); END;
    CREATE TRIGGER evidence_files_no_delete BEFORE DELETE ON evidence_files
    BEGIN SELECT RAISE(ABORT, 'Evidence files are append-only'); END;`);
  },
};
