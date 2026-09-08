// SPDX-License-Identifier: MIT
import type { ModuleDefinition } from '@/main/composition/ModuleDefinition';
import { timedTargetContract } from '@/shared/ipc/contracts/timedTarget.contract';
import type { InferHandlers } from '@/shared/ipc/defineContract';

import { toTimedTargetStateDto } from './toTimedTargetStateDto';

type TimedTargetDeps = 'ipcRouter' | 'timedTargetControl' | 'timingProfileService';

export const timedTargetModule: ModuleDefinition<TimedTargetDeps> = {
  name: 'timed-target',
  deps: ['ipcRouter', 'timedTargetControl', 'timingProfileService'] as const,
  register({ ipcRouter, timedTargetControl, timingProfileService }) {
    const handlers: InferHandlers<typeof timedTargetContract> = {
      analyzeMeasurements: async (input) => timingProfileService.analyzeMeasurements(input),
      getTimingProfiles: async () => timingProfileService.status(),
      recordTimingInstallation: (input) => timingProfileService.recordInstallation(input),
      saveTimingProfile: (input) => timingProfileService.save(input),
      applyTimingProfile: (input) => timingProfileService.apply(input),
      getTimingSettings: async () => timingProfileService.effectiveSettings(),
      setTimingSettings: (input) => timingProfileService.setManualSettings(input),
      getState: async () => {
        const state = timedTargetControl.getState();
        return state ? toTimedTargetStateDto(state) : null;
      },
      cancel: async (input) =>
        toTimedTargetStateDto(
          timedTargetControl.cancel({ sequenceId: input.sequenceId, reason: `Lane operator: ${input.reason}` }),
        ),
    };
    ipcRouter.register(timedTargetContract, handlers);
  },
};
