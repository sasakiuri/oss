import type { Migration } from './Migration';

export const migration064QualificationMalfunctionScoreSheets: Migration = {
  version: 64,
  name: 'qualification_malfunction_score_sheets',
  up(db) {
    db.exec(`
      CREATE TABLE qualification_malfunction_score_sheets (
        id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL REFERENCES qualification_malfunction_cases(id),
        version INTEGER NOT NULL CHECK (version > 0),
        content_json TEXT NOT NULL CHECK (json_valid(content_json)),
        digest TEXT NOT NULL CHECK (length(digest) = 64),
        recorded_at TEXT NOT NULL,
        UNIQUE (case_id, version)
      );
      CREATE TRIGGER trg_malfunction_score_sheets_no_update BEFORE UPDATE ON qualification_malfunction_score_sheets
        BEGIN SELECT RAISE(ABORT, 'malfunction score sheets are append-only'); END;
      CREATE TRIGGER trg_malfunction_score_sheets_no_delete BEFORE DELETE ON qualification_malfunction_score_sheets
        BEGIN SELECT RAISE(ABORT, 'malfunction score sheets are append-only'); END;
    `);
  },
};
