import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { migration010MqttCompetitionShotJournal } from '@/main/infrastructure/database/migrations/010_mqtt_competition_shot_journal';
import { migration052ScoringGeometryEvidence } from '@/main/infrastructure/database/migrations/052_scoring_geometry_evidence';
import type { CompetitionShotObservation } from '@/main/modules/mqtt/domain/ICompetitionShotJournal';
import { SqliteCompetitionShotJournal } from '@/main/modules/mqtt/infra/SqliteCompetitionShotJournal';

describe('SqliteCompetitionShotJournal', () => {
  let database: Database.Database;
  let journal: SqliteCompetitionShotJournal;

  beforeEach(() => {
    database = new Database(':memory:');
    migration010MqttCompetitionShotJournal.up(database);
    migration052ScoringGeometryEvidence.up(database);
    journal = new SqliteCompetitionShotJournal(database);
  });

  afterEach(() => database.close());

  it('preserves separate score evidence and repeated MQTT deliveries', () => {
    const base: CompetitionShotObservation = {
      id: '11111111-1111-4111-8111-111111111111',
      competitionId: 'competition-1',
      laneId: 'lane-1',
      sessionId: 'session-1',
      shotId: 'shot-1',
      sourceObservationId: 'observation-1',
      x: 0.25,
      y: -0.5,
      legacyRawScoreX10: 101,
      deviceScoreX10: 99,
      calculatedScoreX10: 103,
      calculatedScoreAvailable: true,
      effectiveScoreX10: 101,
      targetProfileId: 'ISSF_PISTOL_25M_PRECISION_2026',
      scoringGaugeProfileId: 'ISSF_CENTER_FIRE_9_65_2026',
      innerTen: false,
      mode: 'MATCH',
      firedAt: new Date('2026-08-28T00:00:00.000Z'),
      receivedAt: new Date('2026-08-28T00:00:00.020Z'),
      stageIndex: 1,
      scored: true,
      seriesIndex: 2,
      shotNumberInSeries: 3,
      isRecorded: true,
      isReplay: false,
      publishedAt: new Date('2026-08-28T00:00:00.030Z'),
      observedAt: new Date('2026-08-28T00:00:00.040Z'),
      payloadJson: '{"delivery":1}',
    };
    journal.append(base);
    journal.append({
      ...base,
      id: '22222222-2222-4222-8222-222222222222',
      isReplay: true,
      observedAt: new Date('2026-08-28T00:01:00.000Z'),
      payloadJson: '{"delivery":2}',
    });

    const restored = journal.findByCompetition('competition-1');
    expect(restored).toHaveLength(2);
    expect(restored[0]).toEqual(base);
    expect(restored[1]).toMatchObject({ shotId: 'shot-1', isReplay: true, payloadJson: '{"delivery":2}' });
  });
});
