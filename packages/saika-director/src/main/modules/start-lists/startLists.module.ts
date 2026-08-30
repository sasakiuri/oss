import type { ModuleDefinition } from '@/main/shared-infra/module/ModuleDefinition';
import { startListsContract } from '@/shared/ipc/contracts';

import { StartListService } from './application/StartListService';
import { SqliteStartListRepository } from './infra/SqliteStartListRepository';

export const startListsModule: ModuleDefinition<'database' | 'ipcRouter'> = {
  name: 'startLists',
  deps: ['database', 'ipcRouter'] as const,
  register({ database, ipcRouter }) {
    const service = new StartListService(database, new SqliteStartListRepository(database));
    ipcRouter.register(startListsContract, {
      list: async ({ eventId }) => service.list(eventId),
      createVersion: async (input) => service.createVersion(input),
      approveContent: async (input) => service.approveContent(input),
      approvePaperless: async (input) => service.approvePaperless(input),
      distribute: async (input) => service.distribute(input),
      voidVersion: async (input) => service.voidVersion(input),
      withdrawDistribution: async (input) => service.withdrawDistribution(input),
    });
  },
};
