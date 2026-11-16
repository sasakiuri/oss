import { defineModule } from '@/main/shared-infra/module/ModuleDefinition';
import { finalOperationsContract } from '@/shared/ipc/contracts';

export const finalOperationsModule = defineModule({
  name: 'finalOperations',
  deps: ['ipcRouter', 'finalOperationService'],
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
});
