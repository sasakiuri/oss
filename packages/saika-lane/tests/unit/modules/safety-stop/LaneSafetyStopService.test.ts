import { describe, expect, it, vi } from 'vitest';

import { LaneSafetyStopService } from '@/main/modules/safety-stop/application/LaneSafetyStopService';
import type { ILaneSafetyStopRepository } from '@/main/modules/safety-stop/domain/ILaneSafetyStopRepository';
import type {
  LaneSafetyStopState,
  LaneSafetyTimerSnapshot,
} from '@/main/modules/safety-stop/domain/LaneSafetyStopState';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';

const STOP_ID = '77777777-7777-4777-8777-777777777777';

function repository(): ILaneSafetyStopRepository & { current: LaneSafetyStopState | null } {
  return {
    current: null,
    getCurrent() {
      return this.current;
    },
    appendStopped(state) {
      this.current = state;
    },
    appendTimerFrozen(_id: string, snapshot: LaneSafetyTimerSnapshot) {
      this.current = this.current!.withTimerSnapshot(snapshot);
    },
    appendCleared(state) {
      this.current = state;
    },
  };
}

function eventBus(): IEventBus {
  return { emit: vi.fn(), on: vi.fn(() => () => undefined) } as unknown as IEventBus;
}

describe('LaneSafetyStopService', () => {
  it('persists the fail-safe latch before waiting for timer capture', async () => {
    const repo = repository();
    let releaseFreeze!: (snapshot: LaneSafetyTimerSnapshot) => void;
    const freeze = vi.fn(
      () =>
        new Promise<LaneSafetyTimerSnapshot>((resolve) => {
          releaseFreeze = resolve;
        }),
    );
    const bus = eventBus();
    const service = new LaneSafetyStopService(repo, { freeze }, bus);

    const activation = service.activate({
      safetyStopId: STOP_ID,
      reason: 'Person forward of firing line',
      issuedBy: 'CRO One',
      issuedAt: new Date('2026-09-01T01:00:00Z'),
    });
    await vi.waitFor(() => expect(service.isStopped()).toBe(true));
    expect(repo.current).toMatchObject({ status: 'STOPPED', safetyStopId: STOP_ID, timerSnapshot: null });

    releaseFreeze({
      competitionId: '22222222-2222-4222-8222-222222222222',
      remainingSeconds: 287,
      totalSeconds: 600,
      frozenAt: new Date('2026-09-01T01:00:01Z'),
    });
    await expect(activation).resolves.toMatchObject({
      status: 'STOPPED',
      timerSnapshot: { remainingSeconds: 287, totalSeconds: 600 },
    });
    expect(bus.emit).toHaveBeenCalledTimes(2);
  });

  it('requires matching explicit clearance and never resumes a timer', async () => {
    const repo = repository();
    const freeze = vi.fn().mockResolvedValue(null);
    const service = new LaneSafetyStopService(repo, { freeze }, eventBus());
    await service.activate({
      safetyStopId: STOP_ID,
      reason: 'Emergency',
      issuedBy: 'CRO One',
      issuedAt: new Date('2026-09-01T01:00:00Z'),
    });

    await expect(
      service.clear({
        safetyStopId: '88888888-8888-4888-8888-888888888888',
        clearanceReason: 'Inspected',
        clearedBy: 'CRO One',
        clearedAt: new Date('2026-09-01T01:05:00Z'),
        confirmedSafe: true,
      }),
    ).rejects.toThrow('does not match');

    await expect(
      service.clear({
        safetyStopId: STOP_ID,
        clearanceReason: 'Range inspected and all firearms unloaded',
        clearedBy: 'CRO One',
        clearedAt: new Date('2026-09-01T01:05:00Z'),
        confirmedSafe: true,
      }),
    ).resolves.toMatchObject({ status: 'CLEAR', clearanceReason: 'Range inspected and all firearms unloaded' });
    expect(freeze).toHaveBeenCalledTimes(1);
  });
});
