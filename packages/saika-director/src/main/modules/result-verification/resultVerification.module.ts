import type { ModuleDefinition } from '@/main/shared-infra/module/ModuleDefinition';
import { resultVerificationContract } from '@/shared/ipc/contracts';

import { ResultVerificationService } from './application/ResultVerificationService';

export const resultVerificationModule: ModuleDefinition<
  'queryBus' | 'ipcRouter' | 'qualificationResultsReader' | 'resultVerificationRepository' | 'competitionTypeRegistry'
> = {
  name: 'resultVerification',
  deps: [
    'queryBus',
    'ipcRouter',
    'qualificationResultsReader',
    'resultVerificationRepository',
    'competitionTypeRegistry',
  ] as const,
  register({ queryBus, ipcRouter, qualificationResultsReader, resultVerificationRepository, competitionTypeRegistry }) {
    const service = new ResultVerificationService(
      queryBus,
      qualificationResultsReader,
      resultVerificationRepository,
      competitionTypeRegistry,
    );
    ipcRouter.register(resultVerificationContract, {
      getStatus: ({ eventId }) => service.getStatus(eventId),
      addCheck: (input) => service.addCheck(input),
      approve: (input) => service.approve(input),
      revokeApproval: (input) => service.revokeApproval(input),
    });
  },
};
