// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import { EstComplaintSignalService, SqliteEstComplaintSignalRepository } from '@/main/modules/est-complaint-signal';
import { createSqliteDb } from '@/main/shared-infra/sqlite/SqliteDb';

const context = {
  competitionId: 'b2222222-2222-4222-a222-222222222222',
  sessionId: 'c3333333-3333-4333-a333-333333333333',
  participantId: 'participant-12',
  participantName: 'Test Athlete',
  startNumber: '12',
  phase: 'MATCH' as const,
  stageIndex: 1,
  seriesIndex: 2,
  seriesShotLimit: 5,
  recordedShots: 3,
  timedTargetProgramId: 'rapid-4s',
  exposureIndex: 2,
  lastShot: {
    shotId: 'd4444444-4444-4444-a444-444444444444',
    shotNumberInSeries: 3,
    firedAt: '2026-09-04T00:00:00.000Z',
    receivedAt: '2026-09-04T00:00:00.100Z',
  },
};

describe('EstComplaintSignalService', () => {
  it('persists an immutable complaint snapshot and its clearance', () => {
    const database = createSqliteDb(':memory:');
    const repository = new SqliteEstComplaintSignalRepository(database);
    const service = new EstComplaintSignalService(repository);

    const active = service.signal({ issue: 'SHOT_VALUE', context, message: 'Displayed value looks wrong' });
    expect(active).toMatchObject({ status: 'ACTIVE', issue: 'SHOT_VALUE', context });
    expect(Object.isFrozen(active.context)).toBe(true);
    expect(Object.isFrozen(active.context.lastShot)).toBe(true);
    expect(() => service.signal({ issue: 'OTHER', context })).toThrow('already active');

    const cleared = service.clear({ signalId: active.signalId, clearedBy: 'Lane user' });
    expect(cleared).toMatchObject({ status: 'CLEARED', signalId: active.signalId, context });
    expect(new EstComplaintSignalService(repository).getState()).toMatchObject({
      status: 'CLEARED',
      signalId: active.signalId,
      context,
    });
    expect(() => database.prepare('UPDATE est_complaint_signal_events SET message = ?').run('changed')).toThrow(
      'append-only',
    );
    database.close();
  });

  it('keeps adjudication and score changes outside the signal', () => {
    const database = createSqliteDb(':memory:');
    const service = new EstComplaintSignalService(new SqliteEstComplaintSignalRepository(database));

    const active = service.signal({ issue: 'TARGET_FAILURE', context: { ...context, lastShot: null } });

    expect(active).not.toHaveProperty('timeliness');
    expect(active).not.toHaveProperty('decision');
    expect(active).not.toHaveProperty('score');
    expect(active).not.toHaveProperty('timer');
    database.close();
  });
});
