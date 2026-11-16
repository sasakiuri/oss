import { defineModule } from '@/main/shared-infra/module/ModuleDefinition';
import { mixedTeamTimeoutsContract } from '@/shared/ipc/contracts';
import { MixedTeamTimeoutService } from './application/MixedTeamTimeoutService';
import { SqliteMixedTeamTimeoutRepository } from './infra/SqliteMixedTeamTimeoutRepository';

export const mixedTeamTimeoutsModule = defineModule({
  name: 'mixedTeamTimeouts',
  deps: ['database', 'ipcRouter'],
  register({ database, ipcRouter }) {
    const service = new MixedTeamTimeoutService(new SqliteMixedTeamTimeoutRepository(database));
    ipcRouter.register(mixedTeamTimeoutsContract, {
      list: ({ competitionId }) => service.list(competitionId),
      start: (input) => service.start(input),
      close: (input) => service.close(input),
      voidTimeout: (input) => service.voidTimeout(input),
    });
  },
});
