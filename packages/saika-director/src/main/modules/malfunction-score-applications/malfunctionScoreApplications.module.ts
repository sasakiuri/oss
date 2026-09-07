import type { ModuleDefinition } from '@/main/shared-infra/module/ModuleDefinition';
import { malfunctionScoreApplicationsContract } from '@/shared/ipc/contracts';

export const malfunctionScoreApplicationsModule: ModuleDefinition<'ipcRouter' | 'malfunctionScoreApplicationService'> =
  {
    name: 'malfunctionScoreApplications',
    deps: ['ipcRouter', 'malfunctionScoreApplicationService'] as const,
    register({ ipcRouter, malfunctionScoreApplicationService: service }) {
      ipcRouter.register(malfunctionScoreApplicationsContract, {
        list: async ({ caseId }) => service.list(caseId),
        preview: async (input) => service.preview(input),
        apply: async (input) => service.apply(input),
        withdraw: async (input) => service.withdraw(input),
      });
      return {};
    },
  };
