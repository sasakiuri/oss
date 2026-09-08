// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from 'vitest';

import type { ITimedTargetControl } from '@/main/modules/timed-target';
import { timedTargetModule } from '@/main/modules/timed-target/timedTarget.module';
import { TimingProfileService, StoredTimingProfiles } from '@/main/modules/timing-profiles';
import type { timedTargetContract } from '@/shared/ipc/contracts/timedTarget.contract';
import type { InferHandlers } from '@/shared/ipc/defineContract';
import { DEFAULT_TIMED_TARGET_TIMING_SETTINGS } from '@/shared/mqtt/TimedTargetTimingSettings';

import {
  createMockCompetitionRepository,
  createMockIpcRouter,
  createMockStorage,
} from '../../../helpers/mockDependencies';

describe('shot timing settings', () => {
  function setup() {
    const storage = createMockStorage();
    const ipcRouter = createMockIpcRouter();
    const competitionRepository = createMockCompetitionRepository();
    timedTargetModule.register({
      ipcRouter,
      timingProfileService: new TimingProfileService(new StoredTimingProfiles(storage), {
        connection: () => null,
        hasActiveCompetition: async () => !!(await competitionRepository.findActive()),
      }),
      timedTargetControl: { getState: vi.fn(), cancel: vi.fn() } as unknown as ITimedTargetControl,
    });
    const handlers = vi.mocked(ipcRouter.register).mock.calls[0]![1] as InferHandlers<typeof timedTargetContract>;
    return { storage, competitionRepository, handlers };
  }

  it('starts with unknown measured bounds and stores a validated installation setting', async () => {
    const { storage, handlers } = setup();
    await expect(handlers.getTimingSettings()).resolves.toEqual(DEFAULT_TIMED_TARGET_TIMING_SETTINGS);
    const saved = { mode: 'BOUNDED' as const, maximumReceiptDelayMilliseconds: 200, clockUncertaintyMilliseconds: 10 };
    await handlers.setTimingSettings(saved);
    expect(storage.setMany).toHaveBeenCalledWith(expect.objectContaining({ 'timedTarget.timingSettings': saved }));
    await expect(handlers.setTimingSettings({ ...saved, clockUncertaintyMilliseconds: -1 })).rejects.toThrow();
    expect(storage.setMany).toHaveBeenCalledTimes(1);
  });

  it('preserves timing settings while a competition is active', async () => {
    const { storage, competitionRepository, handlers } = setup();
    vi.mocked(competitionRepository.findActive).mockResolvedValue({} as never);
    await expect(
      handlers.setTimingSettings({ ...DEFAULT_TIMED_TARGET_TIMING_SETTINGS, mode: 'TIMESTAMP' }),
    ).rejects.toThrow('Finish the active competition');
    expect(storage.setMany).not.toHaveBeenCalled();
  });
});
