import {
  SqliteEventSummaryReader,
  SqliteFiringPointAssignmentRepository,
  SqliteParticipantRepository,
} from '@/main/modules/championship';
import { defineModule } from '@/main/shared-infra/module/ModuleDefinition';
import { squaddingContract } from '@/shared/ipc/contracts';
import { SquaddingService } from './application/SquaddingService';
import { SqliteSquaddingRepository } from './infra/SqliteSquaddingRepository';

export const squaddingModule = defineModule({
  name: 'squadding',
  deps: ['database', 'ipcRouter', 'competitionTypeRegistry'],
  register({ database, ipcRouter, competitionTypeRegistry }) {
    const service = new SquaddingService(
      new SqliteSquaddingRepository(database),
      {
        events: new SqliteEventSummaryReader(database),
        participants: new SqliteParticipantRepository(database),
        assignments: new SqliteFiringPointAssignmentRepository(database),
      },
      competitionTypeRegistry,
    );
    ipcRouter.register(squaddingContract, {
      list: async ({ eventId }) => service.list(eventId),
      createDraw: async (input) => service.createDraw(input),
      approve: async (input) => service.approve(input),
      apply: async (input) => service.apply(input),
      voidDraw: async (input) => service.voidDraw(input),
    });
  },
});
