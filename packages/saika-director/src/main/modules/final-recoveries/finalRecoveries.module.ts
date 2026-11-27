import { AssignedFinalRecoverySubjectSource } from './infra/AssignedFinalRecoverySubjectSource';
import { defineModule } from '@/main/shared-infra/module/ModuleDefinition';
import { finalRecoveriesContract } from '@/shared/ipc/contracts';

import { FinalRecoveryService } from './application/FinalRecoveryService';
import { SqliteFinalRecoveryRepository } from './infra/SqliteFinalRecoveryRepository';

export const finalRecoveriesModule = defineModule({
  name: 'finalRecoveries',
  deps: ['database', 'ipcRouter', 'laneControlRepository', 'participantRepository'],
  register({ database, ipcRouter, laneControlRepository, participantRepository }) {
    const service = new FinalRecoveryService(
      new SqliteFinalRecoveryRepository(database),
      undefined,
      new AssignedFinalRecoverySubjectSource(participantRepository, laneControlRepository),
    );
    ipcRouter.register(finalRecoveriesContract, {
      bindAllowanceSubject: async (input) => service.bindAllowanceSubject(input),
      listByCompetition: async ({ competitionId }) => service.listByCompetition(competitionId),
      listByEvent: async ({ eventId }) => service.listByEvent(eventId),
      create: async (input) => service.create(input),
      appendEntry: async (input) => service.appendEntry(input),
    });
  },
});
