import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import { migration010MqttCompetitionShotJournal } from '@/main/infrastructure/database/migrations/010_mqtt_competition_shot_journal';
import { migration052ScoringGeometryEvidence } from '@/main/infrastructure/database/migrations/052_scoring_geometry_evidence';

describe('migration052ScoringGeometryEvidence', () => {
  let database: Database.Database | undefined;

  afterEach(() => database?.close());

  it('adds independent target-face and scoring-gauge evidence columns idempotently', () => {
    database = new Database(':memory:');
    migration010MqttCompetitionShotJournal.up(database);

    migration052ScoringGeometryEvidence.up(database);
    migration052ScoringGeometryEvidence.up(database);

    const columns = database.prepare('PRAGMA table_info(mqtt_competition_shot_observations)').all() as {
      name: string;
    }[];
    expect(columns.map((column) => column.name)).toEqual(
      expect.arrayContaining(['target_profile_id', 'scoring_gauge_profile_id']),
    );
  });
});
