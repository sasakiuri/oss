import type { ModuleDefinition } from '@/main/shared-infra/module/ModuleDefinition';
import { squaddingContract } from '@/shared/ipc/contracts';
import { SquaddingService } from './application/SquaddingService';
import { SqliteSquaddingRepository } from './infra/SqliteSquaddingRepository';

export const squaddingModule: ModuleDefinition<'database' | 'ipcRouter' | 'competitionTypeRegistry'> = {
  name: 'squadding',
  deps: ['database', 'ipcRouter', 'competitionTypeRegistry'] as const,
  register({ database, ipcRouter, competitionTypeRegistry }) {
    const service = new SquaddingService(database, new SqliteSquaddingRepository(database), competitionTypeRegistry);
    ipcRouter.register(squaddingContract, {
      list: async ({ eventId }) => service.list(eventId),
      createDraw: async (input) => service.createDraw(input),
      approve: async (input) => service.approve(input),
      apply: async (input) => service.apply(input),
      voidDraw: async (input) => service.voidDraw(input),
    });
  },
};
