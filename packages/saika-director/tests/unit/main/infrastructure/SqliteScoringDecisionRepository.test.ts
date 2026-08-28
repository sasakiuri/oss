import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { migration011ScoringDecisions } from '@/main/infrastructure/database/migrations/011_scoring_decisions';
import { ScoringDecision } from '@/main/modules/scoring-decisions/domain/ScoringDecision';
import { SqliteScoringDecisionRepository } from '@/main/modules/scoring-decisions/infra/SqliteScoringDecisionRepository';

describe('SqliteScoringDecisionRepository', () => {
  let database: Database.Database;
  let repository: SqliteScoringDecisionRepository;

  beforeEach(() => {
    database = new Database(':memory:');
    database.pragma('foreign_keys = ON');
    migration011ScoringDecisions.up(database);
    repository = new SqliteScoringDecisionRepository(database);
  });

  afterEach(() => database.close());

  it('appends decisions and revocations without updating or deleting the original', () => {
    const target = {
      eventId: '11111111-1111-4111-8111-111111111111',
      participantId: 'participant-1',
      relayNumber: 2,
      resultScope: 'QUALIFICATION' as const,
      resultIdAtDecision: '22222222-2222-4222-8222-222222222222',
      sourceCompetitionId: '33333333-3333-4333-8333-333333333333',
    };
    const decision = ScoringDecision.create({
      ...target,
      type: 'DEDUCTION',
      applicationPolicy: 'SPECIFIC_SHOT',
      pointsX10: 20,
      seriesIndex: 1,
      shotIndex: 11,
      ruleReference: '6.14.7',
      incidentReportNumber: 'IR-42',
      publicRemark: 'Two-point deduction',
      internalNote: 'Verified against independent memory',
      officialName: 'RTS Jury A',
      decidedAt: new Date('2026-08-28T00:00:00.000Z'),
    });
    const revocation = ScoringDecision.createRevocation({
      ...target,
      reversesDecisionId: decision.id,
      ruleReference: '6.14.5',
      reason: 'Penalty rescinded',
      officialName: 'RTS Jury Chair',
      decidedAt: new Date('2026-08-28T00:01:00.000Z'),
    });

    repository.append(decision);
    repository.append(revocation);

    expect(repository.findById(decision.id)).toEqual(decision);
    expect(repository.findByTarget(target.eventId, target.participantId, 2, 'QUALIFICATION')).toEqual([
      decision,
      revocation,
    ]);
    expect(repository.findByEventId(target.eventId, 'FINAL')).toEqual([]);
    expect(database.prepare('SELECT COUNT(*) AS count FROM scoring_decisions').get()).toEqual({ count: 2 });
  });
});
