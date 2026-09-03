import type { ModuleDefinition } from '@/main/shared-infra/module/ModuleDefinition';
import { operationalArchivesContract } from '@/shared/ipc/contracts';

export const operationalArchivesModule: ModuleDefinition<'ipcRouter' | 'operationalArchiveService'> = {
  name: 'operationalArchives',
  deps: ['ipcRouter', 'operationalArchiveService'],
  register({ ipcRouter, operationalArchiveService }) {
    ipcRouter.register(operationalArchivesContract, {
      exportCompetitionEvidence: (input) => operationalArchiveService.exportCompetitionEvidence(input.championshipId),
      createDatabaseBackup: () => operationalArchiveService.createDatabaseBackup(),
      inspectRestoreCandidate: () => operationalArchiveService.inspectRestoreCandidate(),
      scheduleRestore: (input) => operationalArchiveService.scheduleRestore(input.candidateToken),
      getPendingRestore: () => operationalArchiveService.getPendingRestore(),
      cancelPendingRestore: () => operationalArchiveService.cancelPendingRestore(),
    });
  },
};
