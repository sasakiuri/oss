import { defineModule } from '@/main/shared-infra/module/ModuleDefinition';
import { equipmentRegistryContract } from '@/shared/ipc/contracts';

import { EquipmentRegistryService } from './application/EquipmentRegistryService';
import { SqliteEquipmentRegistryRepository } from './infra/SqliteEquipmentRegistryRepository';

export const equipmentRegistryModule = defineModule({
  name: 'equipmentRegistry',
  deps: ['database', 'ipcRouter'],
  register({ database, ipcRouter }) {
    const repository = new SqliteEquipmentRegistryRepository(database);
    const service = new EquipmentRegistryService(repository, (championshipId) => repository.athletes(championshipId));
    ipcRouter.register(equipmentRegistryContract, {
      getWorkspace: async (input) => service.getWorkspace(input),
      saveEquipment: async (input) => service.saveEquipment(input),
      recordCalibration: async (input) => service.recordCalibration(input),
      recordInspection: async (input) => service.recordInspection(input),
      withdraw: async (input) => service.withdraw(input),
    });
  },
});
