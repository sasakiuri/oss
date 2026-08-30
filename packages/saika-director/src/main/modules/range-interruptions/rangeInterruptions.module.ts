import type { ModuleDefinition } from '@/main/shared-infra/module/ModuleDefinition';
import { rangeInterruptionsContract } from '@/shared/ipc/contracts';

import { RangeInterruptionService } from './application/RangeInterruptionService';

export const rangeInterruptionsModule: ModuleDefinition<'ipcRouter' | 'rangeInterruptionRepository'> = {
  name: 'rangeInterruptions',
  deps: ['ipcRouter', 'rangeInterruptionRepository'] as const,
  register({ ipcRouter, rangeInterruptionRepository }) {
    const service = new RangeInterruptionService(rangeInterruptionRepository);
    ipcRouter.register(rangeInterruptionsContract, {
      listAll: () => service.listAll(),
      listByScope: (scope) => service.listByScope(scope),
      getById: ({ caseId }) => service.getById(caseId),
      create: (input) => service.create(input),
      linkScope: (input) => service.linkScope(input),
      appendEntry: (input) => service.appendEntry(input),
      recordTargetRecovery: (input) => service.recordTargetRecovery(input),
      recordCommandBatch: (input) => service.recordCommandBatch(input),
    });
  },
};
