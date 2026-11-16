import { defineModule } from '@/main/shared-infra/module/ModuleDefinition';
import { malfunctionScoreApplicationsContract } from '@/shared/ipc/contracts';

export const malfunctionScoreApplicationsModule = defineModule({
  name: 'malfunctionScoreApplications',
  deps: ['ipcRouter', 'malfunctionScoreApplicationService'],
  register({ ipcRouter, malfunctionScoreApplicationService: service }) {
    ipcRouter.register(malfunctionScoreApplicationsContract, {
      list: async ({ caseId }) => service.list(caseId),
      preview: async (input) => service.preview(input),
      apply: async (input) => service.apply(input),
      withdraw: async (input) => service.withdraw(input),
    });
    return {};
  },
});
