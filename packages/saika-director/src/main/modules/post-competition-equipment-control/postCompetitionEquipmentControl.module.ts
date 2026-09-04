import type { ModuleDefinition } from '@/main/shared-infra/module/ModuleDefinition';
import { postCompetitionEquipmentControlContract } from '@/shared/ipc/contracts';

import { PostCompetitionEquipmentControlService } from './application/PostCompetitionEquipmentControlService';
import { SqliteEquipmentControlSubjectSource } from './infra/SqliteEquipmentControlSubjectSource';
import { SqlitePostCompetitionEquipmentCheckRepository } from './infra/SqlitePostCompetitionEquipmentCheckRepository';

export const postCompetitionEquipmentControlModule: ModuleDefinition<'database' | 'ipcRouter'> = {
  name: 'postCompetitionEquipmentControl',
  deps: ['database', 'ipcRouter'],
  register({ database, ipcRouter }) {
    const service = new PostCompetitionEquipmentControlService(
      new SqlitePostCompetitionEquipmentCheckRepository(database),
      new SqliteEquipmentControlSubjectSource(database),
    );
    ipcRouter.register(postCompetitionEquipmentControlContract, {
      list: async ({ championshipId }) => service.list(championshipId),
      select: async (input) => service.select(input),
      issueNotice: async (input) => service.issueNotice(input),
      recordTest: async (input) => service.recordTest(input),
      confirmFailure: async (input) => service.confirmFailure(input),
      voidCheck: async (input) => service.voidCheck(input),
    });
  },
};
