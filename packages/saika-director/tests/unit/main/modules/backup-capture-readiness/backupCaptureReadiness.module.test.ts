// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from 'vitest';

import { backupCaptureReadinessModule } from '@/main/modules/backup-capture-readiness';
import { backupCaptureReadinessContract } from '@/shared/ipc/contracts';

type Handlers = {
  get(input: { competitionId: string }): Promise<unknown>;
  save(input: unknown): Promise<unknown>;
  sources(): Promise<unknown>;
};

function register() {
  const service = { get: vi.fn(() => 'current'), save: vi.fn(() => 'saved') };
  const router = { register: vi.fn() };
  backupCaptureReadinessModule.register({
    ipcRouter: router as never,
    backupCaptureReadinessService: service as never,
    backupCaptureSources: {
      plans: {
        list: () => [
          { eventId: 'event-1', sourceLabel: 'Range feed' },
          { eventId: 'removed', sourceLabel: 'Old feed' },
          { eventId: 'event-2', sourceLabel: 'Final feed' },
        ],
      },
      events: {
        findById: (eventId) =>
          eventId === 'removed' ? null : { name: eventId === 'event-1' ? 'Air Rifle' : 'Air Pistol' },
      },
    },
  });
  expect(router.register).toHaveBeenCalledExactlyOnceWith(backupCaptureReadinessContract, expect.any(Object));
  return { service, handlers: router.register.mock.calls[0]![1] as Handlers };
}

describe('backupCaptureReadinessModule', () => {
  it('reads and saves the readiness settings through the service', async () => {
    const { service, handlers } = register();
    const input = { competitionId: 'competition-1', mode: 'REQUIRED' };

    await expect(handlers.get({ competitionId: 'competition-1' })).resolves.toBe('current');
    await expect(handlers.save(input)).resolves.toBe('saved');

    expect(service.get).toHaveBeenCalledExactlyOnceWith('competition-1');
    expect(service.save).toHaveBeenCalledExactlyOnceWith(input);
  });

  it('lists each capture plan of an existing event as "<event> · <source>"', async () => {
    await expect(register().handlers.sources()).resolves.toEqual([
      { eventId: 'event-1', label: 'Air Rifle · Range feed' },
      { eventId: 'event-2', label: 'Air Pistol · Final feed' },
    ]);
  });
});
