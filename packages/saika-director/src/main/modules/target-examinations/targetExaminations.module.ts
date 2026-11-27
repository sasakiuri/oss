import { defineModule } from '@/main/shared-infra/module/ModuleDefinition';
import { targetExaminationsContract } from '@/shared/ipc/contracts';

export const targetExaminationsModule = defineModule({
  name: 'targetExaminations',
  deps: ['ipcRouter', 'targetExaminationService'],
  register({ ipcRouter, targetExaminationService: service }) {
    ipcRouter.register(targetExaminationsContract, {
      listAll: async () => service.listAll(),
      listByScope: async (scope) => service.listByScope(scope),
      getById: async ({ caseId }) => service.getById(caseId),
      create: async (input) => service.create(input),
      linkScope: async (input) => service.linkScope(input),
      addEvidence: async (input) => service.addEvidence(input),
      appendEntry: async (input) => service.appendEntry(input),
    });
  },
});
