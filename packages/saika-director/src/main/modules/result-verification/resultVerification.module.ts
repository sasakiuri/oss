import type { ModuleDefinition } from '@/main/shared-infra/module/ModuleDefinition';
import { resultVerificationContract } from '@/shared/ipc/contracts';

export const resultVerificationModule: ModuleDefinition<'ipcRouter' | 'resultVerificationService'> = {
  name: 'resultVerification',
  deps: ['ipcRouter', 'resultVerificationService'] as const,
  register({ ipcRouter, resultVerificationService: service }) {
    ipcRouter.register(resultVerificationContract, {
      getStatus: ({ eventId, resultScope }) => service.getStatus(eventId, resultScope),
      addCheck: (input) => service.addCheck(input),
      approve: (input) => service.approve(input),
      revokeApproval: (input) => service.revokeApproval(input),
    });
  },
};
