import type { ModuleDefinition } from '@/main/shared-infra/module/ModuleDefinition';
import { finalRecoveriesContract } from '@/shared/ipc/contracts';

import { FinalRecoveryService } from './application/FinalRecoveryService';
import { SqliteFinalRecoveryRepository } from './infra/SqliteFinalRecoveryRepository';

export const finalRecoveriesModule: ModuleDefinition<'database' | 'ipcRouter'> = {
  name: 'finalRecoveries',
  deps: ['database', 'ipcRouter'] as const,
  register({ database, ipcRouter }) {
    const service = new FinalRecoveryService(new SqliteFinalRecoveryRepository(database));
    ipcRouter.register(finalRecoveriesContract, {
      listByCompetition: async ({ competitionId }) => service.listByCompetition(competitionId),
      listByEvent: async ({ eventId }) => service.listByEvent(eventId),
      create: async (input) => service.create(input),
      appendEntry: async (input) => service.appendEntry(input),
    });
  },
};
