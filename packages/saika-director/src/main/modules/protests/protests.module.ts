import type { ModuleDefinition } from '@/main/shared-infra/module/ModuleDefinition';
import { protestsContract } from '@/shared/ipc/contracts';
import { ProtestService } from './application/ProtestService';
import { SqliteProtestRepository } from './infra/SqliteProtestRepository';

export const protestsModule: ModuleDefinition<'database' | 'ipcRouter'> = {
  name: 'protests',
  deps: ['database', 'ipcRouter'] as const,
  register({ database, ipcRouter }) {
    const service = new ProtestService(new SqliteProtestRepository(database));
    ipcRouter.register(protestsContract, {
      list: (input) => service.list(input),
      create: (input) => service.create(input),
      recordEntry: (input) => service.recordEntry(input),
    });
  },
};
