import type { ModuleDefinition } from '@/main/shared-infra/module/ModuleDefinition';
import { eliminationPlanningContract } from '@/shared/ipc/contracts';

import { OutdoorEliminationPlanningService } from './application/OutdoorEliminationPlanningService';
import { SqliteEliminationPlanningSource } from './infra/SqliteEliminationPlanningSource';
import { SqliteOutdoorEliminationPlanRepository } from './infra/SqliteOutdoorEliminationPlanRepository';

export const eliminationPlanningModule: ModuleDefinition<'database' | 'ipcRouter' | 'competitionTypeRegistry'> = {
  name: 'eliminationPlanning',
  deps: ['database', 'ipcRouter', 'competitionTypeRegistry'],
  register({ database, ipcRouter, competitionTypeRegistry }) {
    const service = new OutdoorEliminationPlanningService(
      new SqliteOutdoorEliminationPlanRepository(database),
      new SqliteEliminationPlanningSource(database),
      competitionTypeRegistry,
    );
    ipcRouter.register(eliminationPlanningContract, {
      list: async ({ eventId }) => service.list(eventId),
      create: async (input) => service.create(input),
      approve: async (input) => service.approve(input),
      announceQuotas: async (input) => service.announceQuotas(input),
      voidPlan: async (input) => service.voidPlan(input),
    });
  },
};
