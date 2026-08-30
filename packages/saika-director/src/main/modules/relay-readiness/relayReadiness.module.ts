import type { ModuleDefinition } from '@/main/shared-infra/module/ModuleDefinition';
import { relayReadinessContract } from '@/shared/ipc/contracts';

import { RelayReadinessService } from './application/RelayReadinessService';
import { SqliteRelayReadinessRepository } from './infra/SqliteRelayReadinessRepository';

export const relayReadinessModule: ModuleDefinition<'database' | 'ipcRouter'> = {
  name: 'relayReadiness',
  deps: ['database', 'ipcRouter'] as const,
  register({ database, ipcRouter }) {
    const service = new RelayReadinessService(new SqliteRelayReadinessRepository(database));
    ipcRouter.register(relayReadinessContract, {
      list: (input) => service.list(input),
      record: (input) => service.record(input),
      assess: (input) => service.assess(input),
    });
  },
};
