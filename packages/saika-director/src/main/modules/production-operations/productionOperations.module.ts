import type { ModuleDefinition } from '@/main/shared-infra/module/ModuleDefinition';
import { productionOperationsContract } from '@/shared/ipc/contracts';
import { ProductionOperationService } from './application/ProductionOperationService';
import { SqliteProductionOperationRepository } from './infra/SqliteProductionOperationRepository';

export const productionOperationsModule: ModuleDefinition<'database' | 'ipcRouter'> = {
  name: 'productionOperations',
  deps: ['database', 'ipcRouter'] as const,
  register({ database, ipcRouter }) {
    const service = new ProductionOperationService(new SqliteProductionOperationRepository(database));
    ipcRouter.register(productionOperationsContract, {
      list: ({ competitionId }) => service.list(competitionId),
      assess: (input) => service.assess(input),
      record: (input) => service.record(input),
    });
  },
};
