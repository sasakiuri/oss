import type { ModuleDefinition } from '@/main/shared-infra/module/ModuleDefinition';
import { estBackupVerificationContract } from '@/shared/ipc/contracts';

export const estBackupVerificationModule: ModuleDefinition<'ipcRouter' | 'estBackupVerificationService'> = {
  name: 'estBackupVerification',
  deps: ['ipcRouter', 'estBackupVerificationService'] as const,
  register({ ipcRouter, estBackupVerificationService: service }) {
    ipcRouter.register(estBackupVerificationContract, {
      list: ({ eventId }) => service.list(eventId),
      verify: (input) => service.verify(input),
    });
  },
};
