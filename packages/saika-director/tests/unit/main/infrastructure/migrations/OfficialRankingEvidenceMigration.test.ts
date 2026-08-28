import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import { migration003CreateSchema } from '@/main/infrastructure/database/migrations/003_create_schema';
import { migration010MqttCompetitionShotJournal } from '@/main/infrastructure/database/migrations/010_mqtt_competition_shot_journal';
import { migration011ScoringDecisions } from '@/main/infrastructure/database/migrations/011_scoring_decisions';
import { migration012OfficialRankingEvidence } from '@/main/infrastructure/database/migrations/012_official_ranking_evidence';

describe('official ranking evidence migration', () => {
  let database: Database.Database | undefined;

  afterEach(() => database?.close());

  it('adds provenance columns, backfills family names, and is idempotent', () => {
    database = new Database(':memory:');
    migration003CreateSchema.up(database);
    migration010MqttCompetitionShotJournal.up(database);
    migration011ScoringDecisions.up(database);
    database
      .prepare(
        `INSERT INTO championships (id, name, date, venue)
         VALUES ('championship-1', 'Championship', '2026-08-28', 'Range')`,
      )
      .run();
    database
      .prepare(
        `INSERT INTO events (id, championship_id, name, event_type, round, sort_order)
         VALUES ('event-1', 'championship-1', 'Qualification', 'BR60S', 'Qualification', 0)`,
      )
      .run();
    database
      .prepare(
        `INSERT INTO participants (id, event_id, player_name, affiliation, logo_path, sort_order)
         VALUES ('participant-1', 'event-1', 'Alex Smith', 'Team', NULL, 0)`,
      )
      .run();
    database
      .prepare(
        `INSERT INTO results (
           id, event_id, participant_id, player_name, affiliation, relay_number,
           total_score, shots_detail, confirmed_at
         ) VALUES (
           'result-1', 'event-1', 'participant-1', 'Alex Smith', 'Team', 1,
           10, '[10]', '2026-08-28T00:00:00.000Z'
         )`,
      )
      .run();

    migration012OfficialRankingEvidence.up(database);
    migration012OfficialRankingEvidence.up(database);

    expect(database.prepare('SELECT family_name FROM participants').get()).toEqual({ family_name: 'Alex Smith' });
    expect(database.prepare('SELECT family_name, source_lane_id, ranking_shots_detail FROM results').get()).toEqual({
      family_name: 'Alex Smith',
      source_lane_id: null,
      ranking_shots_detail: '[]',
    });
    expect(
      (database.prepare('PRAGMA table_info(mqtt_competition_shot_observations)').all() as { name: string }[]).some(
        (column) => column.name === 'calculated_score_available',
      ),
    ).toBe(true);
  });
});
