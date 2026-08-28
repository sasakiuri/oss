import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import { EventId, ParticipantId } from '@/main/modules/championship';
import { Result } from '@/main/modules/results/domain/Result';
import { ResultId } from '@/main/modules/results/domain/ResultId';
import { SqliteResultRepository } from '@/main/modules/results/infra/SqliteResultRepository';

const EVENT_ID = '22222222-2222-4222-8222-222222222222';
const FIRST_COMPETITION_ID = '11111111-1111-4111-8111-111111111111';
const SECOND_COMPETITION_ID = '88888888-8888-4888-8888-888888888888';
const FIRST_PARTICIPANT_ID = '44444444-4444-4444-8444-444444444444';
const SECOND_PARTICIPANT_ID = '66666666-6666-4666-8666-666666666666';
const REPLACEMENT_PARTICIPANT_ID = '77777777-7777-4777-8777-777777777777';

function createResult(participantId: string, score: number, competitionId: string): Result {
  return Result.create(
    ResultId.generate(),
    EventId.create(EVENT_ID),
    ParticipantId.create(participantId),
    `Athlete ${participantId}`,
    'Team',
    score,
    [score],
    [score],
    2,
    'published',
    undefined,
    competitionId,
    `Family ${participantId}`,
    `lane-${participantId}`,
    [
      {
        ringScore: Math.floor(score),
        decimalScore: score,
        innerTen: true,
        shotId: `shot-${participantId}`,
        seriesIndex: 0,
      },
    ],
  );
}

describe('SqliteResultRepository', () => {
  let database: Database.Database | undefined;

  afterEach(() => {
    database?.close();
    database = undefined;
  });

  it('replaces only results created by the selected competition', () => {
    database = new Database(':memory:');
    database.exec(`
      CREATE TABLE results (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL,
        participant_id TEXT NOT NULL,
        player_name TEXT NOT NULL,
        family_name TEXT,
        affiliation TEXT NOT NULL DEFAULT '',
        relay_number INTEGER NOT NULL,
        total_score REAL NOT NULL,
        series1 REAL NOT NULL DEFAULT 0.0,
        series2 REAL NOT NULL DEFAULT 0.0,
        series3 REAL NOT NULL DEFAULT 0.0,
        series4 REAL NOT NULL DEFAULT 0.0,
        series5 REAL NOT NULL DEFAULT 0.0,
        series6 REAL NOT NULL DEFAULT 0.0,
        shots_detail TEXT NOT NULL,
        confirmed_at TEXT NOT NULL,
        status TEXT NOT NULL,
        source_competition_id TEXT,
        source_lane_id TEXT,
        ranking_shots_detail TEXT NOT NULL DEFAULT '[]',
        UNIQUE(event_id, participant_id)
      );
    `);
    const repository = new SqliteResultRepository(database);

    repository.replaceByCompetitionId(EVENT_ID, 2, FIRST_COMPETITION_ID, [
      createResult(FIRST_PARTICIPANT_ID, 10, FIRST_COMPETITION_ID),
    ]);
    repository.replaceByCompetitionId(EVENT_ID, 2, SECOND_COMPETITION_ID, [
      createResult(SECOND_PARTICIPANT_ID, 20, SECOND_COMPETITION_ID),
    ]);
    repository.replaceByCompetitionId(EVENT_ID, 2, FIRST_COMPETITION_ID, [
      createResult(REPLACEMENT_PARTICIPANT_ID, 30, FIRST_COMPETITION_ID),
    ]);

    expect(
      repository.findByEventIdAndRelay(EVENT_ID, 2).map((result) => ({
        participantId: result.participantId.value,
        sourceCompetitionId: result.sourceCompetitionId,
        familyName: result.familyName,
        sourceLaneId: result.sourceLaneId,
        rankingShots: result.rankingShots,
      })),
    ).toEqual([
      {
        participantId: REPLACEMENT_PARTICIPANT_ID,
        sourceCompetitionId: FIRST_COMPETITION_ID,
        familyName: `Family ${REPLACEMENT_PARTICIPANT_ID}`,
        sourceLaneId: `lane-${REPLACEMENT_PARTICIPANT_ID}`,
        rankingShots: [
          {
            ringScore: 30,
            decimalScore: 30,
            innerTen: true,
            shotId: `shot-${REPLACEMENT_PARTICIPANT_ID}`,
            seriesIndex: 0,
          },
        ],
      },
      {
        participantId: SECOND_PARTICIPANT_ID,
        sourceCompetitionId: SECOND_COMPETITION_ID,
        familyName: `Family ${SECOND_PARTICIPANT_ID}`,
        sourceLaneId: `lane-${SECOND_PARTICIPANT_ID}`,
        rankingShots: [
          {
            ringScore: 20,
            decimalScore: 20,
            innerTen: true,
            shotId: `shot-${SECOND_PARTICIPANT_ID}`,
            seriesIndex: 0,
          },
        ],
      },
    ]);
  });
});
