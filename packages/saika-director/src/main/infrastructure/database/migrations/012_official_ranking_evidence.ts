import type { Migration } from './Migration';

function addColumnIfMissing(
  db: Parameters<Migration['up']>[0],
  table: string,
  column: string,
  definition: string,
): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!columns.some((entry) => entry.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

/**
 * Stores the evidence required by ISSF 6.15.1 independently from the effective
 * result values. Existing databases remain rankable through the legacy score
 * fallback, while new results retain X/decimal/Lane provenance.
 */
export const migration012OfficialRankingEvidence: Migration = {
  version: 12,
  name: 'official_ranking_evidence',
  up(db) {
    addColumnIfMissing(db, 'participants', 'family_name', 'TEXT');
    addColumnIfMissing(db, 'results', 'family_name', 'TEXT');
    addColumnIfMissing(db, 'results', 'source_lane_id', 'TEXT');
    addColumnIfMissing(db, 'results', 'ranking_shots_detail', "TEXT NOT NULL DEFAULT '[]'");
    addColumnIfMissing(
      db,
      'mqtt_competition_shot_observations',
      'calculated_score_available',
      'INTEGER NOT NULL DEFAULT 0 CHECK (calculated_score_available IN (0, 1))',
    );

    db.exec(`
      UPDATE participants
         SET family_name = player_name
       WHERE family_name IS NULL OR TRIM(family_name) = '';
      UPDATE results
         SET family_name = player_name
       WHERE family_name IS NULL OR TRIM(family_name) = '';

      CREATE INDEX IF NOT EXISTS idx_mqtt_shot_observations_competition_lane_session
        ON mqtt_competition_shot_observations(
          competition_id, lane_id, session_id, stage_index, series_index, shot_number_in_series
        );
      CREATE UNIQUE INDEX IF NOT EXISTS uq_scoring_decisions_single_revocation
        ON scoring_decisions(reverses_decision_id)
        WHERE reverses_decision_id IS NOT NULL;
    `);
  },
};
