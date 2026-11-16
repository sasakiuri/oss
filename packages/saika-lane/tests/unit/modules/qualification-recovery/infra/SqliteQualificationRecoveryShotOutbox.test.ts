// SPDX-License-Identifier: MIT
import type { QualificationRecoveryShotPayload } from '@sasakiuri/saika-protocol/QualificationRecovery';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SqliteQualificationRecoveryShotOutbox } from '@/main/modules/qualification-recovery';
import { createSqliteDb } from '@/main/shared-infra/sqlite/SqliteDb';

const RUN_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_RUN_ID = '99999999-9999-4999-8999-999999999999';
const FIRST_SHOT = '44444444-4444-4444-8444-444444444444';
const SECOND_SHOT = '55555555-5555-4555-8555-555555555555';

describe('SqliteQualificationRecoveryShotOutbox', () => {
  let database: ReturnType<typeof createSqliteDb>;
  let outbox: SqliteQualificationRecoveryShotOutbox;

  beforeEach(() => {
    database = createSqliteDb(':memory:');
    outbox = new SqliteQualificationRecoveryShotOutbox(database);
  });

  afterEach(() => database.close());

  it('returns unpublished shots in enqueue order and ignores a replayed shot', () => {
    outbox.enqueue(shot(FIRST_SHOT, RUN_ID));
    outbox.enqueue(shot(SECOND_SHOT, OTHER_RUN_ID));
    outbox.enqueue({ ...shot(FIRST_SHOT, RUN_ID), effectiveScoreX10: 50 });

    expect(outbox.findPending().map((entry) => [entry.shotId, entry.effectiveScoreX10])).toEqual([
      [FIRST_SHOT, 100],
      [SECOND_SHOT, 100],
    ]);
    expect(outbox.findPending(1).map((entry) => entry.shotId)).toEqual([FIRST_SHOT]);
    expect(outbox.findByRunId(RUN_ID).map((entry) => entry.shotId)).toEqual([FIRST_SHOT]);
    expect(outbox.hasShot(SECOND_SHOT)).toBe(true);
    expect(outbox.hasShot(RUN_ID)).toBe(false);
  });

  it('keeps the first publication time when a shot is marked twice', () => {
    outbox.enqueue(shot(FIRST_SHOT, RUN_ID));
    outbox.enqueue(shot(SECOND_SHOT, RUN_ID));

    outbox.markPublished(FIRST_SHOT, new Date('2026-09-03T01:02:00.000Z'));
    outbox.markPublished(FIRST_SHOT, new Date('2026-09-03T01:03:00.000Z'));

    expect(outbox.findPending().map((entry) => entry.shotId)).toEqual([SECOND_SHOT]);
    expect(
      database.prepare('SELECT published_at FROM qualification_recovery_shot_outbox WHERE shot_id = ?').get(FIRST_SHOT),
    ).toEqual({ published_at: '2026-09-03T01:02:00.000Z' });
    expect(outbox.findByRunId(RUN_ID)).toHaveLength(2);
  });
});

function shot(shotId: string, runId: string): QualificationRecoveryShotPayload {
  return {
    schemaVersion: 1,
    laneId: '33333333-3333-4333-8333-333333333333',
    competitionId: '11111111-1111-4111-8111-111111111111',
    runId,
    decisionId: '66666666-6666-4666-8666-666666666666',
    interruptionId: '77777777-7777-4777-8777-777777777777',
    phase: 'SERIES_RECOVERY',
    stageIndex: 1,
    seriesIndex: 0,
    shotId,
    x: null,
    y: null,
    rawScoreX10: 100,
    deviceScoreX10: 100,
    calculatedScoreX10: 100,
    effectiveScoreX10: 100,
    innerTen: false,
    firedAt: '2026-09-03T01:01:00.000Z',
    receivedAt: '2026-09-03T01:01:00.000Z',
    publishedAt: '2026-09-03T01:01:00.000Z',
  };
}
