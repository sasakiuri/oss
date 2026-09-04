import type { Migration } from './Migration';

/** Links an official qualification malfunction case to one immutable Lane declaration. */
export const migration060QualificationMalfunctionSignalLink: Migration = {
  version: 60,
  name: 'qualification_malfunction_signal_link',
  up(db) {
    db.exec(`
      ALTER TABLE qualification_malfunction_cases
        ADD COLUMN source_signal_id TEXT
          CHECK(source_signal_id IS NULL OR length(trim(source_signal_id)) > 0);

      CREATE UNIQUE INDEX uq_qualification_malfunction_source_signal
        ON qualification_malfunction_cases(source_signal_id)
        WHERE source_signal_id IS NOT NULL;

      CREATE TRIGGER trg_qualification_malfunction_source_signal_required
      BEFORE INSERT ON qualification_malfunction_cases
      WHEN
        (NEW.report_source = 'LANE_SIGNAL' AND NEW.source_signal_id IS NULL)
        OR (NEW.report_source = 'DIRECTOR_MANUAL' AND NEW.source_signal_id IS NOT NULL)
      BEGIN
        SELECT RAISE(ABORT, 'Lane signal cases require one source signal; manual cases must not have one');
      END;
    `);
  },
};
