import { defineModule } from '@/main/shared-infra/module/ModuleDefinition';
import { resultVerificationContract } from '@/shared/ipc/contracts';

export const resultVerificationModule = defineModule({
  name: 'resultVerification',
  deps: ['ipcRouter', 'resultVerificationService'],
  register({ ipcRouter, resultVerificationService: service }) {
    ipcRouter.register(resultVerificationContract, {
      getStatus: ({ eventId, resultScope }) => service.getStatus(eventId, resultScope),
      addCheck: (input) => service.addCheck(input),
      approve: (input) => service.approve(input),
      revokeApproval: (input) => service.revokeApproval(input),
    });
  },
});
