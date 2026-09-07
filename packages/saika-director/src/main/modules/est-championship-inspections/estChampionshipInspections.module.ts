import type { ModuleDefinition } from '@/main/shared-infra/module/ModuleDefinition';
import { estChampionshipInspectionsContract } from '@/shared/ipc/contracts';

import { EstChampionshipInspectionService } from './application/EstChampionshipInspectionService';
import { SqliteEstChampionshipInspectionRepository } from './infra/SqliteEstChampionshipInspectionRepository';

export const estChampionshipInspectionsModule: ModuleDefinition<
  'database' | 'ipcRouter' | 'estInspectionStartService'
> = {
  name: 'estChampionshipInspections',
  deps: ['database', 'ipcRouter', 'estInspectionStartService'],
  register({ database, ipcRouter, estInspectionStartService }) {
    const service = new EstChampionshipInspectionService(new SqliteEstChampionshipInspectionRepository(database));
    ipcRouter.register(estChampionshipInspectionsContract, {
      getStartSettings: async (input) => estInspectionStartService.getSettings(input.competitionId),
      setStartSettings: async (input) => estInspectionStartService.saveSettings(input),
      get: (input) => service.get(input.championshipId),
      createPlan: (input) => service.createPlan(input),
      record: (input) => service.record(input),
      revoke: (input) => service.revoke(input),
    });
  },
};
