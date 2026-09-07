import type { Migration } from './Migration';

/** NULL identifies legacy rows whose six series columns are the only retained series evidence. */
export const migration067QualificationResultSeries: Migration = {
  version: 67,
  name: 'qualification_result_series',
  up(db) {
    db.exec(`ALTER TABLE results ADD COLUMN series_scores_json TEXT
      CHECK (series_scores_json IS NULL OR
        (json_valid(series_scores_json) AND json_type(series_scores_json) = 'array'));`);
  },
};
