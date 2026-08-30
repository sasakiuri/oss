import type { ModuleDefinition } from '@/main/shared-infra/module/ModuleDefinition';
import { adjudicationCasesContract } from '@/shared/ipc/contracts';

import { AdjudicationCaseService } from './application/AdjudicationCaseService';
import { SqliteAdjudicationCaseRepository } from './infra/SqliteAdjudicationCaseRepository';

export const adjudicationCasesModule: ModuleDefinition<'database' | 'ipcRouter'> = {
  name: 'adjudicationCases',
  deps: ['database', 'ipcRouter'] as const,
  register({ database, ipcRouter }) {
    const service = new AdjudicationCaseService(new SqliteAdjudicationCaseRepository(database));
    ipcRouter.register(adjudicationCasesContract, {
      list: async (input) => service.list(input),
      create: async (input) => service.create(input),
      appendEntry: async (input) => service.appendEntry(input),
      linkArtifact: async (input) => service.linkArtifact(input),
      unlinkArtifact: async (input) => service.unlinkArtifact(input),
    });
  },
};
