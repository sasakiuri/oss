import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { migration018FiringWindowReview } from '@/main/infrastructure/database/migrations/018_firing_window_review';
import type { FiringCommandBoundary, FiringWindowViolation } from '@/main/modules/mqtt/domain/IFiringWindowJournal';
import { SqliteFiringWindowJournal } from '@/main/modules/mqtt/infra/SqliteFiringWindowJournal';

describe('SqliteFiringWindowJournal', () => {
  let database: Database.Database;
  let journal: SqliteFiringWindowJournal;

  beforeEach(() => {
    database = new Database(':memory:');
    database.pragma('foreign_keys = ON');
    migration018FiringWindowReview.up(database);
    journal = new SqliteFiringWindowJournal(database);
  });

  afterEach(() => database.close());

  it('persists an append-only boundary and deduplicated review evidence', () => {
    const boundary: FiringCommandBoundary = {
      id: '11111111-1111-4111-8111-111111111111',
      competitionId: '22222222-2222-4222-8222-222222222222',
      phase: 'MATCH',
      transition: 'CLOSE',
      occurredAt: new Date('2026-08-30T01:00:00.000Z'),
      commandId: '33333333-3333-4333-8333-333333333333',
      commandIssuedAt: new Date('2026-08-30T01:00:00.050Z'),
      sourceAction: 'timer-expired',
      recordedAt: new Date('2026-08-30T01:00:00.100Z'),
    };
    const violation: FiringWindowViolation = {
      id: '44444444-4444-4444-8444-444444444444',
      competitionId: boundary.competitionId,
      laneId: '55555555-5555-4555-8555-555555555555',
      sessionId: '66666666-6666-4666-8666-666666666666',
      shotId: '77777777-7777-4777-8777-777777777777',
      observationId: '88888888-8888-4888-8888-888888888888',
      shotMode: 'MATCH',
      policyRuleId: 'issf.6.11.1.3.after-match-stop',
      kind: 'AFTER_MATCH_STOP',
      ruleReference: '6.11.1.3',
      reviewGuidance: 'Review the post-STOP shot.',
      timestampSource: 'FIRED_AT',
      clockToleranceMilliseconds: 0,
      evaluatedShotAt: new Date('2026-08-30T01:00:02.000Z'),
      firedAt: new Date('2026-08-30T01:00:02.000Z'),
      receivedAt: new Date('2026-08-30T01:00:02.010Z'),
      observedAt: new Date('2026-08-30T01:00:02.020Z'),
      decisiveBoundaryId: boundary.id,
      detectedAt: new Date('2026-08-30T01:00:02.030Z'),
    };

    expect(journal.appendBoundary(boundary)).toBe(true);
    expect(journal.appendBoundary({ ...boundary, id: '99999999-9999-4999-8999-999999999999' })).toBe(false);
    expect(journal.appendViolation(violation)).toBe(true);
    expect(journal.appendViolation({ ...violation, id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' })).toBe(false);

    expect(journal.findBoundariesByCompetition(boundary.competitionId)).toEqual([boundary]);
    expect(journal.findViolationsByCompetition(boundary.competitionId)).toEqual([violation]);
    expect(() =>
      database.prepare('UPDATE mqtt_firing_window_violations SET review_guidance = ?').run('Changed'),
    ).toThrow('Firing-window violations are append-only');
    expect(() => database.prepare('DELETE FROM mqtt_firing_command_boundaries').run()).toThrow(
      'Firing command boundaries are append-only',
    );
  });
});
