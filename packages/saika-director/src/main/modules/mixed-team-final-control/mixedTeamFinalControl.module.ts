import { defineModule } from '@/main/shared-infra/module/ModuleDefinition';
import { mixedTeamFinalControlContract } from '@/shared/ipc/contracts';
import { MixedTeamFinalControlService } from './application/MixedTeamFinalControlService';
import { SqliteMixedTeamFinalControlRepository } from './infra/SqliteMixedTeamFinalControlRepository';

export const mixedTeamFinalControlModule = defineModule({
  name: 'mixedTeamFinalControl',
  deps: ['database', 'ipcRouter', 'competitionTypeRegistry'],
  register({ database, ipcRouter, competitionTypeRegistry }) {
    const service = new MixedTeamFinalControlService(
      new SqliteMixedTeamFinalControlRepository(database),
      competitionTypeRegistry,
    );
    ipcRouter.register(mixedTeamFinalControlContract, {
      list: async ({ competitionId }) => service.list(competitionId),
      assess: async (input) => service.assess(input),
      recordDecision: async (input) => service.recordDecision(input),
      recordCommandBatch: async (input) => service.recordCommandBatch(input),
      voidDecision: async (input) => service.voidDecision(input),
    });
  },
});
