import type { ModuleDefinition } from '@/main/shared-infra/module/ModuleDefinition';
import { estComplaintsContract } from '@/shared/ipc/contracts';

import { EstComplaintCaseService } from './application/EstComplaintCaseService';
import { ObservedEstComplaintSignalSource } from './infra/ObservedEstComplaintSignalSource';
import { SqliteEstComplaintCaseLinkRepository } from './infra/SqliteEstComplaintCaseLinkRepository';
import { TargetExaminationCaseGateway } from './infra/TargetExaminationCaseGateway';

export const estComplaintsModule: ModuleDefinition<
  'database' | 'eventBus' | 'ipcRouter' | 'targetExaminationRepository'
> = {
  name: 'estComplaints',
  deps: ['database', 'eventBus', 'ipcRouter', 'targetExaminationRepository'] as const,
  register({ database, eventBus, ipcRouter, targetExaminationRepository }) {
    const signals = new ObservedEstComplaintSignalSource();
    const service = new EstComplaintCaseService(
      signals,
      new SqliteEstComplaintCaseLinkRepository(database),
      new TargetExaminationCaseGateway(targetExaminationRepository),
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
};
