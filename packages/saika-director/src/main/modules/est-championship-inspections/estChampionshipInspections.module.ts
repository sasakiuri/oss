import type { ModuleDefinition } from '@/main/shared-infra/module/ModuleDefinition';
import { estChampionshipInspectionsContract } from '@/shared/ipc/contracts';

import { EstChampionshipInspectionService } from './application/EstChampionshipInspectionService';
import { SqliteEstChampionshipInspectionRepository } from './infra/SqliteEstChampionshipInspectionRepository';

export const estChampionshipInspectionsModule: ModuleDefinition<'database' | 'ipcRouter'> = {
  name: 'estChampionshipInspections',
  deps: ['database', 'ipcRouter'],
  register({ database, ipcRouter }) {
    const service = new EstChampionshipInspectionService(new SqliteEstChampionshipInspectionRepository(database));
    ipcRouter.register(estChampionshipInspectionsContract, {
      get: (input) => service.get(input.championshipId),
      createPlan: (input) => service.createPlan(input),
      record: (input) => service.record(input),
      revoke: (input) => service.revoke(input),
    });
  },
};
