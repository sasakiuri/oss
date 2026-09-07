import { SqliteFinalRecoveryRepository } from '@/main/modules/final-recoveries';
import type { ModuleDefinition } from '@/main/shared-infra/module/ModuleDefinition';
import { finalRecoveryFiringContract } from '@/shared/ipc/contracts';
import { AuthorizedFinalFiringSource } from './AuthorizedFinalFiringSource';
import {
  FinalFiringContextToken,
  FinalFiringTransportToken,
  FinalRecoveryFiringService,
} from './FinalRecoveryFiringService';
import { SqliteFinalFiringRepository } from './SqliteFinalFiringRepository';

export const finalRecoveryFiringModule: ModuleDefinition<'database' | 'ipcRouter' | 'commandBus'> = {
  name: 'finalRecoveryFiring',
  deps: ['database', 'ipcRouter', 'commandBus'],
  register({ database, ipcRouter, commandBus }) {
    const service = new FinalRecoveryFiringService(
      new SqliteFinalFiringRepository(database),
      new AuthorizedFinalFiringSource(new SqliteFinalRecoveryRepository(database), (competitionId, laneId) =>
        commandBus.execute(FinalFiringContextToken, { competitionId, laneId }),
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
};
