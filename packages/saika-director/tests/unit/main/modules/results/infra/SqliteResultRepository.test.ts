import { ISSF_2026_RFPM } from '@sasakiuri/saika-rules';
import Database from 'better-sqlite3';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import { migration067QualificationResultSeries } from '@/main/infrastructure/database/migrations/067_qualification_result_series';
import { EventId, Participant, ParticipantId } from '@/main/modules/championship';
import { QualificationResultsReader } from '@/main/modules/results/application/QualificationResultsReader';
import { Result } from '@/main/modules/results/domain/Result';
import { ResultId } from '@/main/modules/results/domain/ResultId';
import { SqliteResultRepository } from '@/main/modules/results/infra/SqliteResultRepository';
import type { IScoringDecisionRepository } from '@/main/modules/scoring-decisions';
import { ScoringDecision } from '@/main/modules/scoring-decisions/domain/ScoringDecision';
import type { QueryBus } from '@/main/shared-infra/cqrs/QueryBus';
import { CompetitionTypeRegistry, competitionTypeFromRulePack, IssfStandardStrategy } from '@/shared/competitionTypes';

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

  beforeEach(() => {
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
    migration067QualificationResultSeries.up(database);
  });

  it('replaces only results created by the selected competition', () => {
    const repository = new SqliteResultRepository(database!);

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

  it.each([
    { totalSeries: 12, totalShots: 60 },
    { totalSeries: 6, totalShots: 60 },
    { totalSeries: 4, totalShots: 40 },
  ])('retains exact series and shot counts after restart: $totalSeries / $totalShots', (format) => {
    const series = Array.from({ length: format.totalSeries }, (_, index) => 40 + index);
    const shots = Array.from({ length: format.totalShots }, (_, index) => index % 11);
    const original = Result.create(
      ResultId.generate(),
      EventId.create(EVENT_ID),
      ParticipantId.create(FIRST_PARTICIPANT_ID),
      'Athlete',
      'Team',
      series.reduce((sum, score) => sum + score, 0),
      series,
      shots,
      2,
      'confirmed',
      format,
      FIRST_COMPETITION_ID,
    );
    new SqliteResultRepository(database!).save(original);
    const restored = new SqliteResultRepository(database!).findById(original.id.value)!;
    expect(restored.seriesScores).toEqual(series);
    expect(restored.shots).toEqual(shots);
    expect(restored.totalScore).toBe(original.totalScore);
    expect(restored.status).toBe('confirmed');
    expect(restored.confirm().seriesScores).toEqual(series);
  });

  it('reads legacy six-column evidence without inventing missing series', () => {
    const repository = new SqliteResultRepository(database!);
    const original = createResult(FIRST_PARTICIPANT_ID, 10, FIRST_COMPETITION_ID);
    repository.save(original);
    database!.prepare('UPDATE results SET series_scores_json = NULL WHERE id = ?').run(original.id.value);
    expect(repository.findById(original.id.value)!.seriesScores).toEqual(original.seriesScores);
    expect(repository.findById(original.id.value)!.shots).toEqual(original.shots);
  });

  it('rejects corrupt extended series rather than silently falling back to six columns', () => {
    const repository = new SqliteResultRepository(database!);
    const original = createResult(FIRST_PARTICIPANT_ID, 10, FIRST_COMPETITION_ID);
    repository.save(original);
    database!.prepare('UPDATE results SET series_scores_json = ? WHERE id = ?').run('[null]', original.id.value);
    expect(() => repository.findById(original.id.value)).toThrow('invalid stored series');
  });

  it('projects a last-series RFPM decision after DB reload and flags truncated legacy evidence', async () => {
    const definition = competitionTypeFromRulePack(ISSF_2026_RFPM);
    const registry = new CompetitionTypeRegistry();
    registry.registerStrategy(new IssfStandardStrategy());
    registry.register(definition);
    const repository = new SqliteResultRepository(database!);
    const original = Result.create(
      ResultId.generate(),
      EventId.create(EVENT_ID),
      ParticipantId.create(FIRST_PARTICIPANT_ID),
      'Athlete',
      'Team',
      600,
      Array(12).fill(50),
      Array(60).fill(10),
      2,
      'confirmed',
      definition.resultFormat,
      FIRST_COMPETITION_ID,
    );
    repository.save(original);
    const decision = ScoringDecision.create({
      eventId: EVENT_ID,
      participantId: FIRST_PARTICIPANT_ID,
      relayNumber: 2,
      resultScope: 'QUALIFICATION',
      resultIdAtDecision: original.id.value,
      sourceCompetitionId: FIRST_COMPETITION_ID,
      type: 'DEDUCTION',
      applicationPolicy: 'SPECIFIC_SHOT',
      seriesIndex: 11,
      shotIndex: 59,
      pointsX10: 20,
      ruleReference: 'Official incident',
      publicRemark: 'Two point deduction in the last series',
      officialName: 'RTS',
    });
    const reader = new QualificationResultsReader(
      { execute: vi.fn(async () => ({ eventType: definition.id })) } as unknown as QueryBus,
      new SqliteResultRepository(database!),
      { findByEventId: () => [decision] } as unknown as IScoringDecisionRepository,
      registry,
      {
        findByEventId: () => [
          Participant.create(original.participantId, original.eventId, original.playerName, original.affiliation),
        ],
      },
    );
    const projected = (await reader.getByEvent(EVENT_ID))[0]!;
    expect(projected.totalScore).toBe(598);
    expect(projected.seriesScores).toEqual([...Array(11).fill(50), 48]);
    expect(projected.projectionIssues).toEqual([]);
    database!.prepare('UPDATE results SET series_scores_json = NULL').run();
    const legacy = (await reader.getByEvent(EVENT_ID))[0]!;
    expect(legacy.projectionIssues).toContainEqual(expect.stringContaining('requires 12'));
    expect(legacy.revision).not.toBe(projected.revision);
  });
});
