import { defineModule } from '@/main/shared-infra/module/ModuleDefinition';
import { productionOperationsContract } from '@/shared/ipc/contracts';
import { ProductionOperationService } from './application/ProductionOperationService';
import { SqliteProductionOperationRepository } from './infra/SqliteProductionOperationRepository';

export const productionOperationsModule = defineModule({
  name: 'productionOperations',
  deps: ['database', 'ipcRouter'],
  register({ database, ipcRouter }) {
    const service = new ProductionOperationService(new SqliteProductionOperationRepository(database));
    ipcRouter.register(productionOperationsContract, {
      list: ({ competitionId }) => service.list(competitionId),
      assess: (input) => service.assess(input),
      record: (input) => service.record(input),
    });
  },
});
