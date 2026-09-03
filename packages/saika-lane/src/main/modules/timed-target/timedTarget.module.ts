// SPDX-License-Identifier: MIT
import type { ModuleDefinition } from '@/main/composition/ModuleDefinition';
import { timedTargetContract } from '@/shared/ipc/contracts/timedTarget.contract';
import type { InferHandlers } from '@/shared/ipc/defineContract';

import { toTimedTargetStateDto } from './toTimedTargetStateDto';

type TimedTargetDeps = 'ipcRouter' | 'timedTargetControl';

export const timedTargetModule: ModuleDefinition<TimedTargetDeps> = {
  name: 'timed-target',
  deps: ['ipcRouter', 'timedTargetControl'] as const,
  register({ ipcRouter, timedTargetControl }) {
    const handlers: InferHandlers<typeof timedTargetContract> = {
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
