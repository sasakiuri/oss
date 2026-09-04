import type { ModuleDefinition } from '@/main/shared-infra/module/ModuleDefinition';
import { estBackupVerificationContract } from '@/shared/ipc/contracts';

export const estBackupVerificationModule: ModuleDefinition<
  'ipcRouter' | 'estBackupVerificationService' | 'estBackupRecordImportService'
> = {
  name: 'estBackupVerification',
  deps: ['ipcRouter', 'estBackupVerificationService', 'estBackupRecordImportService'] as const,
  register({ ipcRouter, estBackupVerificationService: service, estBackupRecordImportService: imports }) {
    ipcRouter.register(estBackupVerificationContract, {
      list: ({ eventId }) => service.list(eventId),
      importRecords: () => imports.importRecords(),
      verify: (input) => service.verify(input),
    });
  },
};
