import type { TimedTargetStateDto } from '@/shared/ipc/contracts';

import { createServiceMethod, createVoidServiceMethod } from './createServiceMethod';

export const timedTargetService = {
  getState: createVoidServiceMethod<TimedTargetStateDto | null>(() => window.electronAPI.timedTarget.getState()),
  cancel: createServiceMethod<{ sequenceId: string; reason: string }, TimedTargetStateDto>((input) =>
    window.electronAPI.timedTarget.cancel(input),
  ),
};
