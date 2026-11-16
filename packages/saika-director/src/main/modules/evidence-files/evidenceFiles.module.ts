import { defineModule } from '@/main/shared-infra/module/ModuleDefinition';
import { evidenceFilesContract } from '@/shared/ipc/contracts';

export const evidenceFilesModule = defineModule({
  name: 'evidenceFiles',
  deps: ['ipcRouter', 'evidenceFileService'],
  register({ ipcRouter, evidenceFileService }) {
    ipcRouter.register(evidenceFilesContract, {
      list: async ({ evidenceId }) => [...evidenceFileService.list(evidenceId)],
      importFile: (input) => evidenceFileService.importFile(input),
      exportFile: ({ id }) => evidenceFileService.exportFile(id),
    });
  },
});
