import { SqliteEventRepository, SqliteParticipantRepository } from '@/main/modules/championship';
import type { ModuleDefinition } from '@/main/shared-infra/module/ModuleDefinition';
import { qualificationMalfunctionsContract } from '@/shared/ipc/contracts';

import { DirectorQualificationMalfunctionSubjectResolver } from './application/DirectorQualificationMalfunctionSubjectResolver';
import { QualificationMalfunctionService } from './application/QualificationMalfunctionService';
import { RegistryQualificationMalfunctionPolicyResolver } from './application/RegistryQualificationMalfunctionPolicyResolver';
import { SqliteQualificationMalfunctionRepository } from './infra/SqliteQualificationMalfunctionRepository';
import { ObservedQualificationMalfunctionSignalSource } from './infra/ObservedQualificationMalfunctionSignalSource';

export const qualificationMalfunctionsModule: ModuleDefinition<
  'database' | 'eventBus' | 'ipcRouter' | 'competitionTypeRegistry' | 'laneControlRepository'
> = {
  name: 'qualificationMalfunctions',
  deps: ['database', 'eventBus', 'ipcRouter', 'competitionTypeRegistry', 'laneControlRepository'] as const,
  register({ database, eventBus, ipcRouter, competitionTypeRegistry, laneControlRepository }) {
    const signals = new ObservedQualificationMalfunctionSignalSource();
    const service = new QualificationMalfunctionService(
      new SqliteQualificationMalfunctionRepository(database),
      new RegistryQualificationMalfunctionPolicyResolver(
        new SqliteEventRepository(database, competitionTypeRegistry),
        competitionTypeRegistry,
      ),
      new DirectorQualificationMalfunctionSubjectResolver(
        new SqliteParticipantRepository(database),
        laneControlRepository,
      ),
      signals,
    );
    ipcRouter.register(qualificationMalfunctionsContract, {
      listByCompetition: async ({ competitionId }) => service.listByCompetition(competitionId),
      listByEvent: async ({ eventId }) => service.listByEvent(eventId),
      getById: async ({ caseId }) => service.getById(caseId),
      create: async (input) => service.create(input),
      appendEntry: async (input) => service.appendEntry(input),
    });
    let unsubscribe: (() => void) | null = null;
    return {
      lifecycle: [
        {
          name: 'QualificationMalfunctionSignalSource',
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
