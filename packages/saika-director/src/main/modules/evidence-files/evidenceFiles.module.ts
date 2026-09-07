import type { ModuleDefinition } from '@/main/shared-infra/module/ModuleDefinition';
import { evidenceFilesContract } from '@/shared/ipc/contracts';

export const evidenceFilesModule: ModuleDefinition<'ipcRouter' | 'evidenceFileService'> = {
  name: 'evidenceFiles',
  deps: ['ipcRouter', 'evidenceFileService'],
  register({ ipcRouter, evidenceFileService }) {
    ipcRouter.register(evidenceFilesContract, {
      list: async ({ evidenceId }) => [...evidenceFileService.list(evidenceId)],
      importFile: (input) => evidenceFileService.importFile(input),
      exportFile: ({ id }) => evidenceFileService.exportFile(id),
    });
  },
};
