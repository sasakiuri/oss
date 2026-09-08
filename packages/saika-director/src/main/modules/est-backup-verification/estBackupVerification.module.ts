import type { ModuleDefinition } from '@/main/shared-infra/module/ModuleDefinition';
import { estBackupVerificationContract } from '@/shared/ipc/contracts';
import { ColumnMappedEstBackupRecordParser } from './domain/ColumnMappedEstBackupRecordParser';

export const estBackupVerificationModule: ModuleDefinition<
  'ipcRouter' | 'estBackupVerificationService' | 'estBackupRecordImportService'
> = {
  name: 'estBackupVerification',
  deps: ['ipcRouter', 'estBackupVerificationService', 'estBackupRecordImportService'] as const,
  register({ ipcRouter, estBackupVerificationService: service, estBackupRecordImportService: imports }) {
    ipcRouter.register(estBackupVerificationContract, {
      list: ({ eventId }) => service.list(eventId),
      importRecords: () => imports.importRecords(),
      importDelimitedRecords: (input) => imports.importRecords(new ColumnMappedEstBackupRecordParser(input)),
      verify: (input) => service.verify(input),
    });
  },
};
