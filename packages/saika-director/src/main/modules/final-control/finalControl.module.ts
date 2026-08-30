import type { ModuleDefinition } from '@/main/shared-infra/module/ModuleDefinition';
import { finalControlContract } from '@/shared/ipc/contracts';
import { FinalControlService } from './application/FinalControlService';
import { SqliteFinalControlRepository } from './infra/SqliteFinalControlRepository';

export const finalControlModule: ModuleDefinition<'database' | 'ipcRouter' | 'competitionTypeRegistry'> = {
  name: 'finalControl',
  deps: ['database', 'ipcRouter', 'competitionTypeRegistry'] as const,
  register({ database, ipcRouter, competitionTypeRegistry }) {
    const service = new FinalControlService(new SqliteFinalControlRepository(database), competitionTypeRegistry);
    ipcRouter.register(finalControlContract, {
      list: async ({ competitionId }) => service.list(competitionId),
      assess: async (input) => service.assess(input),
      recordDecision: async (input) => service.recordDecision(input),
      recordCommandResult: async (input) => service.recordCommandResult(input),
      voidDecision: async (input) => service.voidDecision(input),
    });
  },
};
