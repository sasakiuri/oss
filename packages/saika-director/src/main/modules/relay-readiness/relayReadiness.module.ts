import { defineModule } from '@/main/shared-infra/module/ModuleDefinition';
import { relayReadinessContract } from '@/shared/ipc/contracts';

export const relayReadinessModule = defineModule({
  name: 'relayReadiness',
  deps: ['relayReadinessService', 'ipcRouter'],
  register({ relayReadinessService: service, ipcRouter }) {
    ipcRouter.register(relayReadinessContract, {
      getStartSettings: async (input) => service.getStartSettings(input.competitionId),
      setStartSettings: async (input) => service.setStartSettings(input),
      list: (input) => service.list(input),
      record: (input) => service.record(input),
      assess: (input) => service.assess(input),
    });
  },
});
