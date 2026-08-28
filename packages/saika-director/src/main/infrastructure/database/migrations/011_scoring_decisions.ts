import type { Migration } from './Migration';

export const migration011ScoringDecisions: Migration = {
  version: 11,
  name: 'scoring_decisions',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS scoring_decisions (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL,
        participant_id TEXT NOT NULL,
        relay_number INTEGER NOT NULL,
        result_scope TEXT NOT NULL CHECK (result_scope IN ('QUALIFICATION', 'FINAL')),
        result_id_at_decision TEXT NOT NULL,
        source_competition_id TEXT,
        decision_type TEXT NOT NULL,
        application_policy TEXT NOT NULL,
        points_x10 INTEGER,
        series_index INTEGER,
        shot_index INTEGER,
        classification_code TEXT,
        rule_reference TEXT NOT NULL,
        incident_report_number TEXT,
        public_remark TEXT NOT NULL,
        internal_note TEXT,
        official_name TEXT NOT NULL,
        decided_at TEXT NOT NULL,
        reverses_decision_id TEXT REFERENCES scoring_decisions(id)
      );

      CREATE INDEX IF NOT EXISTS idx_scoring_decisions_target
        ON scoring_decisions(event_id, participant_id, relay_number, result_scope, decided_at, id);
      CREATE INDEX IF NOT EXISTS idx_scoring_decisions_reversal
        ON scoring_decisions(reverses_decision_id);
      CREATE UNIQUE INDEX IF NOT EXISTS uq_scoring_decisions_single_revocation
        ON scoring_decisions(reverses_decision_id)
        WHERE reverses_decision_id IS NOT NULL;
    `);
  },
};
