import { defineModule } from '@/main/shared-infra/module/ModuleDefinition';
import { estComplaintsContract } from '@/shared/ipc/contracts';

import { EstComplaintCaseService } from './application/EstComplaintCaseService';
import { ObservedEstComplaintSignalSource } from './infra/ObservedEstComplaintSignalSource';
import { SqliteEstComplaintCaseLinkRepository } from './infra/SqliteEstComplaintCaseLinkRepository';

export const estComplaintsModule = defineModule({
  name: 'estComplaints',
  deps: ['database', 'eventBus', 'ipcRouter', 'targetExaminationService'],
  register({ database, eventBus, ipcRouter, targetExaminationService }) {
    const signals = new ObservedEstComplaintSignalSource();
    const service = new EstComplaintCaseService(
      signals,
      new SqliteEstComplaintCaseLinkRepository(database),
      targetExaminationService,
    );
    ipcRouter.register(estComplaintsContract, {
      listByCompetition: async ({ competitionId }) => service.listByCompetition(competitionId),
      openTargetExamination: async (input) => service.openTargetExamination(input),
    });
    let unsubscribe: (() => void) | null = null;
    return {
      lifecycle: [
        {
          name: 'EstComplaintSignalSource',
          start: () => {
            unsubscribe ??= eventBus.on('MqttControlStateChanged', (event) => signals.observe(event.snapshot));
            return Promise.resolve();
          },
          stop: () => {
            unsubscribe?.();
            unsubscribe = null;
            return Promise.resolve();
          },
        },
      ],
    };
  },
});
