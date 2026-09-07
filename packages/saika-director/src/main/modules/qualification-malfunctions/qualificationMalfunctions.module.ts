import { MalfunctionScoreSheetService } from './application/MalfunctionScoreSheetService';
import { SqliteMalfunctionScoreSheetRepository } from './infra/SqliteMalfunctionScoreSheetRepository';
import { ElectronMalfunctionScoreSheetExporter } from './infra/ElectronMalfunctionScoreSheetExporter';
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
    const repository = new SqliteQualificationMalfunctionRepository(database);
    const scoreSheets = new MalfunctionScoreSheetService(
      repository,
      new SqliteMalfunctionScoreSheetRepository(database),
      new ElectronMalfunctionScoreSheetExporter(),
    );
    const service = new QualificationMalfunctionService(
      repository,
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
      previewScoreSheet: async (input) => scoreSheets.preview(input),
      saveScoreSheet: async ({ input, id, expectedDigest }) => scoreSheets.save(input, id, expectedDigest),
      listScoreSheets: async ({ caseId }) => scoreSheets.list(caseId),
      exportScoreSheet: async ({ id }) => scoreSheets.export(id),
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
