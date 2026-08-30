import type { ModuleDefinition } from '@/main/shared-infra/module/ModuleDefinition';
import { finalOperationsContract } from '@/shared/ipc/contracts';

export const finalOperationsModule: ModuleDefinition<'ipcRouter' | 'finalOperationService'> = {
  name: 'finalOperations',
  deps: ['ipcRouter', 'finalOperationService'] as const,
  register({ ipcRouter, finalOperationService: service }) {
    ipcRouter.register(finalOperationsContract, {
      getByCompetition: async ({ competitionId }) => service.getByCompetition(competitionId),
      create: async (input) => service.create(input),
      confirmStep: async (input) => service.confirmStep(input),
      recordExecution: async (input) => service.recordExecution(input),
      skipStep: async (input) => service.skipStep(input),
      abort: async (input) => service.abort(input),
      startShootOff: async (input) => service.startShootOff(input),
      closeShootOffRound: async (input) => service.closeShootOffRound(input),
    });
  },
};
