import { defineModule } from '@/main/shared-infra/module/ModuleDefinition';
import { championshipContract } from '@/shared/ipc/contracts';

import { ChampionshipService } from './application/ChampionshipService';
import { GetEventByIdToken, GetFiringPointAssignmentsByRelayToken } from './application/championshipQueries';
import { SqliteChampionshipRepository } from './infra/SqliteChampionshipRepository';
import { SqliteEventRepository } from './infra/SqliteEventRepository';
import { SqliteEventResultPresence } from './infra/SqliteEventResultPresence';
import { SqliteFiringPointAssignmentRepository } from './infra/SqliteFiringPointAssignmentRepository';
import { SqliteParticipantRepository } from './infra/SqliteParticipantRepository';

export const championshipModule = defineModule({
  name: 'championship',
  deps: ['database', 'queryBus', 'ipcRouter', 'competitionTypeRegistry'],
  register(ctx) {
    const { database, queryBus, ipcRouter, competitionTypeRegistry } = ctx;

    const service = new ChampionshipService({
      championships: new SqliteChampionshipRepository(database),
      events: new SqliteEventRepository(database, competitionTypeRegistry),
      participants: new SqliteParticipantRepository(database),
      assignments: new SqliteFiringPointAssignmentRepository(database),
      competitionTypes: competitionTypeRegistry,
      results: new SqliteEventResultPresence(database),
    });

    // Cross-module queries (board, results and other modules)
    queryBus.register(GetEventByIdToken, async (query) => service.findEvent(query.eventId));
    queryBus.register(GetFiringPointAssignmentsByRelayToken, async (query) =>
      service.getRelayAssignments(query.eventId, query.relayNumber),
    );

    ipcRouter.register(championshipContract, {
      // --- Commands ---
      create: async (input) => service.createChampionship(input),
      update: async (input) => service.updateChampionship(input),
      delete: async (input) => service.deleteChampionship(input),
      createEvent: async (input) => service.createEvent(input),
      updateEvent: async (input) => service.updateEvent(input),
      deleteEvent: async (input) => service.deleteEvent(input),
      saveParticipants: async (input) => service.saveParticipants(input),
      saveFiringPointAssignments: async (input) => service.saveFiringPointAssignments(input),

      // --- Queries ---
      getAll: async () => service.listChampionships(),
      getDetail: async (input) => service.getDetail(input.id),
      getParticipants: async (input) => service.getParticipants(input.eventId),
      getFiringPointAssignments: async (input) => service.getFiringPointAssignments(input.eventId),
      getCompetitionTypes: async () => service.listCompetitionTypes(),
    });
  },
});
