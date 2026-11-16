import { defineModule } from '@/main/shared-infra/module/ModuleDefinition';
import { protestsContract } from '@/shared/ipc/contracts';

import { ProtestService } from './application/ProtestService';
import { SqliteProtestRepository } from './infra/SqliteProtestRepository';

export const protestsModule = defineModule({
  name: 'protests',
  deps: ['database', 'ipcRouter'],
  register({ database, ipcRouter }) {
    const service = new ProtestService(new SqliteProtestRepository(database));
    ipcRouter.register(protestsContract, {
      list: (input) => service.list(input),
      getById: (input) => service.getById(input.caseId),
      create: (input) => service.create(input),
      recordEntry: (input) => service.recordEntry(input),
    });
  },
});
