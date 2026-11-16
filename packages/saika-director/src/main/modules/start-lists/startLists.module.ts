import {
  SqliteEventSummaryReader,
  SqliteFiringPointAssignmentRepository,
  SqliteParticipantRepository,
} from '@/main/modules/championship';
import { defineModule } from '@/main/shared-infra/module/ModuleDefinition';
import { startListsContract } from '@/shared/ipc/contracts';

import { StartListService } from './application/StartListService';
import { SqliteStartListRepository } from './infra/SqliteStartListRepository';

export const startListsModule = defineModule({
  name: 'startLists',
  deps: ['database', 'ipcRouter', 'participantEligibilityReader'],
  register({ database, ipcRouter, participantEligibilityReader }) {
    const service = new StartListService(
      new SqliteStartListRepository(database),
      {
        events: new SqliteEventSummaryReader(database),
        participants: new SqliteParticipantRepository(database),
        assignments: new SqliteFiringPointAssignmentRepository(database),
      },
      participantEligibilityReader,
    );
    ipcRouter.register(startListsContract, {
      list: async ({ eventId }) => service.list(eventId),
      createVersion: async (input) => service.createVersion(input),
      approveContent: async (input) => service.approveContent(input),
      approvePaperless: async (input) => service.approvePaperless(input),
      distribute: async (input) => service.distribute(input),
      voidVersion: async (input) => service.voidVersion(input),
      withdrawDistribution: async (input) => service.withdrawDistribution(input),
    });
  },
});
