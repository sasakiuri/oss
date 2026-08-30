import type { ModuleDefinition } from '@/main/shared-infra/module/ModuleDefinition';
import { targetExaminationsContract } from '@/shared/ipc/contracts';

import { TargetExaminationService } from './application/TargetExaminationService';

export const targetExaminationsModule: ModuleDefinition<'ipcRouter' | 'targetExaminationRepository'> = {
  name: 'targetExaminations',
  deps: ['ipcRouter', 'targetExaminationRepository'] as const,
  register({ ipcRouter, targetExaminationRepository }) {
    const service = new TargetExaminationService(targetExaminationRepository);
    ipcRouter.register(targetExaminationsContract, {
      listAll: () => service.listAll(),
      listByScope: (scope) => service.listByScope(scope),
      getById: ({ caseId }) => service.getById(caseId),
      create: (input) => service.create(input),
      linkScope: (input) => service.linkScope(input),
      addEvidence: (input) => service.addEvidence(input),
      appendEntry: (input) => service.appendEntry(input),
    });
  },
};
