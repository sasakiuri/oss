import type { Migration } from './Migration';

/** Preserves the exact Lane complaint used to open a Target Examination case. */
export const migration061EstComplaintTargetExaminationLinks: Migration = {
  version: 61,
  name: 'est_complaint_target_examination_links',
  up(db) {
    db.exec(`
      CREATE TABLE est_complaint_target_examination_links (
        signal_id TEXT PRIMARY KEY,
        target_examination_case_id TEXT NOT NULL UNIQUE
          REFERENCES target_examination_cases(id),
        snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
        snapshot_sha256 TEXT NOT NULL
          CHECK(length(snapshot_sha256) = 64 AND snapshot_sha256 NOT GLOB '*[^0-9a-f]*'),
        linked_by TEXT NOT NULL CHECK(length(trim(linked_by)) > 0),
        linked_at TEXT NOT NULL
      );

      CREATE INDEX idx_est_complaint_links_competition
        ON est_complaint_target_examination_links(
          json_extract(snapshot_json, '$.context.competitionId'), linked_at
        );

      CREATE TRIGGER trg_est_complaint_links_no_update
      BEFORE UPDATE ON est_complaint_target_examination_links
      BEGIN
        SELECT RAISE(ABORT, 'EST complaint examination links are append-only');
      END;

      CREATE TRIGGER trg_est_complaint_links_no_delete
      BEFORE DELETE ON est_complaint_target_examination_links
      BEGIN
        SELECT RAISE(ABORT, 'EST complaint examination links are append-only');
      END;
    `);
  },
};
