import { describe, expect, it } from 'vitest';

import { LaneSafetyStopState } from '@/main/modules/safety-stop/domain/LaneSafetyStopState';
import { SqliteLaneSafetyStopRepository } from '@/main/modules/safety-stop/infra/SqliteLaneSafetyStopRepository';
import { createSqliteDb } from '@/main/shared-infra/sqlite/SqliteDb';

describe('SqliteLaneSafetyStopRepository', () => {
  it('reconstructs append-only STOP, timer capture, and clearance evidence', () => {
    const db = createSqliteDb(':memory:');
    const repository = new SqliteLaneSafetyStopRepository(db);
    const stopped = LaneSafetyStopState.create({
      safetyStopId: '77777777-7777-4777-8777-777777777777',
      status: 'STOPPED',
      reason: 'Emergency',
      stoppedBy: 'CRO One',
      stoppedAt: new Date('2026-09-01T01:00:00Z'),
    });
    repository.appendStopped(stopped);
    repository.appendTimerFrozen(stopped.safetyStopId, {
      competitionId: '22222222-2222-4222-8222-222222222222',
      remainingSeconds: 287,
      totalSeconds: 600,
      frozenAt: new Date('2026-09-01T01:00:01Z'),
    });
    repository.appendCleared(
      repository.getCurrent()!.clear({
        clearedBy: 'CRO One',
        clearanceReason: 'Range inspected',
        clearedAt: new Date('2026-09-01T01:05:00Z'),
      }),
    );

    expect(repository.getCurrent()).toMatchObject({
      status: 'CLEAR',
      timerSnapshot: { remainingSeconds: 287 },
      clearanceReason: 'Range inspected',
    });
    expect(() => db.prepare('DELETE FROM lane_safety_stop_events').run()).toThrow('append-only');
    db.close();
  });
});
