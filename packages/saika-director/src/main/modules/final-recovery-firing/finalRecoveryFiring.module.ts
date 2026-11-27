import { defineModule } from '@/main/shared-infra/module/ModuleDefinition';
import { finalRecoveryFiringContract } from '@/shared/ipc/contracts';
import { AuthorizedFinalFiringSource } from './application/AuthorizedFinalFiringSource';
import { FinalRecoveryFiringService } from './application/FinalRecoveryFiringService';
import { FinalFiringContextToken, FinalFiringTransportToken } from './domain/IFinalFiringTransport';
import { SqliteFinalFiringRepository } from './infra/SqliteFinalFiringRepository';

export const finalRecoveryFiringModule = defineModule({
  name: 'finalRecoveryFiring',
  deps: ['database', 'ipcRouter', 'commandBus', 'queryBus', 'finalRecoveryRepository'],
  register({ database, ipcRouter, commandBus, queryBus, finalRecoveryRepository }) {
    const service = new FinalRecoveryFiringService(
      new SqliteFinalFiringRepository(database),
      new AuthorizedFinalFiringSource(finalRecoveryRepository, (competitionId, laneId) =>
        queryBus.execute(FinalFiringContextToken, { competitionId, laneId }),
      ),
      (input) => commandBus.execute(FinalFiringTransportToken, input),
    );
    ipcRouter.register(finalRecoveryFiringContract, {
      list: async ({ caseId }) => service.list(caseId),
      start: (input) => service.start(input),
      read: ({ id }) => service.read(id),
      cancel: ({ id, reason }) => service.cancel(id, reason),
    });
    return {};
  },
});
