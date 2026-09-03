import { describe, expect, it } from 'vitest';

import { SqliteCompetitionShootOffShotOutbox } from '@/main/modules/competition-shoot-off';
import { createSqliteDb } from '@/main/shared-infra/sqlite/SqliteDb';
import type { CompetitionShootOffShotPayload } from '@/shared/mqtt/CompetitionShootOffShot';

const competitionId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const laneId = '33333333-3333-4333-8333-333333333333';

describe('SqliteCompetitionShootOffShotOutbox', () => {
  it('persists every shot in a multi-shot Final round and keeps shot replay idempotent', () => {
    const database = createSqliteDb(':memory:');
    const outbox = new SqliteCompetitionShootOffShotOutbox(database);
    const first = shot('44444444-4444-4444-8444-444444444444', 101, '2026-09-03T01:00:00.000Z');
    const second = shot('55555555-5555-4555-8555-555555555555', 102, '2026-09-03T01:00:01.000Z');

    outbox.enqueue(first);
    outbox.enqueue(second);
    outbox.enqueue(first);

    expect(outbox.findByRound(runId, 1, laneId).map((entry) => entry.shotId)).toEqual([first.shotId, second.shotId]);
    expect(outbox.findPending()).toHaveLength(2);

    outbox.markPublished(first.shotId, new Date('2026-09-03T01:01:00.000Z'));
    expect(outbox.findPending().map((entry) => entry.shotId)).toEqual([second.shotId]);
    database.close();
  });
});

function shot(shotId: string, scoreX10: number, firedAt: string): CompetitionShootOffShotPayload {
  return {
    schemaVersion: 1,
    competitionId,
    runId,
    iteration: 1,
    laneId,
    shotId,
    x: null,
    y: null,
    effectiveScoreX10: scoreX10,
    deviceScoreX10: scoreX10,
    calculatedScoreX10: scoreX10,
    innerTen: false,
    firedAt,
    receivedAt: firedAt,
    publishedAt: firedAt,
  };
}
