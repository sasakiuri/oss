import { defineModule } from '@/main/shared-infra/module/ModuleDefinition';
import { operationalTemplatesContract } from '@/shared/ipc/contracts';

import { OperationalTemplateService } from './OperationalTemplateService';
import { SqliteOperationalTemplateRepository } from './SqliteOperationalTemplateRepository';

export const operationalTemplatesModule = defineModule({
  name: 'operationalTemplates',
  deps: ['database', 'ipcRouter'],
  register({ database, ipcRouter }) {
    const service = new OperationalTemplateService(new SqliteOperationalTemplateRepository(database));
    ipcRouter.register(operationalTemplatesContract, {
      list: async () => service.list(),
      save: async (input) => service.save(input),
      remove: async (input) => service.remove(input),
    });
  },
});
