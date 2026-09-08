import type { ModuleDefinition } from '@/main/shared-infra/module/ModuleDefinition';
import { equipmentRegistryContract, type EquipmentAthlete } from '@/shared/ipc/contracts/equipmentRegistry.contract';

import { EquipmentRegistryService } from './EquipmentRegistryService';
import { SqliteEquipmentRegistryRepository } from './SqliteEquipmentRegistryRepository';

export const equipmentRegistryModule: ModuleDefinition<'database' | 'ipcRouter'> = {
  name: 'equipmentRegistry',
  deps: ['database', 'ipcRouter'],
  register({ database, ipcRouter }) {
    const service = new EquipmentRegistryService(
      new SqliteEquipmentRegistryRepository(database),
      (championshipId) =>
        database
          .prepare(
            'SELECT id, display_name AS name, issf_id AS issfId FROM athlete_identities WHERE championship_id = ? ORDER BY display_name, id',
          )
          .all(championshipId) as EquipmentAthlete[],
    );
    ipcRouter.register(equipmentRegistryContract, {
      getWorkspace: async (input) => service.getWorkspace(input),
      saveEquipment: async (input) => service.saveEquipment(input),
      recordCalibration: async (input) => service.recordCalibration(input),
      recordInspection: async (input) => service.recordInspection(input),
      withdraw: async (input) => service.withdraw(input),
    });
  },
};
