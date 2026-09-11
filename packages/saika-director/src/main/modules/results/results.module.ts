import type { ModuleDefinition } from '@/main/shared-infra/module/ModuleDefinition';

// Command handlers (kept as classes — cross-module orchestration)
import { PublishResultsHandler } from './commands/PublishResultsHandler';
import { PublishMqttResultsHandler } from './commands/PublishMqttResultsHandler';
import { PublishMqttFinalResultsHandler } from './commands/PublishMqttFinalResultsHandler';
import { PublishMqttMixedTeamFinalResultsHandler } from './commands/PublishMqttMixedTeamFinalResultsHandler';
import { PublishFinalResultsHandler } from './commands/PublishFinalResultsHandler';
import { ConfirmResultsHandler } from './commands/ConfirmResultsHandler';

// IPC Contract & response types
import { resultsContract } from '@/shared/ipc/contracts';
import type {
  GetEventResultsResponse,
  GetRelayResultsResponse,
  GetFinalEventResultsResponse,
} from '@/shared/ipc/contracts/results.contract';

// Command Tokens (kept for cross-module command dispatch)
import {
  PublishResultsToken,
  PublishMqttResultsToken,
  PublishMqttFinalResultsToken,
  PublishMqttMixedTeamFinalResultsToken,
  PublishFinalResultsToken,
  ConfirmResultsToken,
} from './tokens';
import { SqliteFinalControlRepository } from '@/main/modules/final-control';
import { SqliteMixedTeamFinalControlRepository } from '@/main/modules/mixed-team-final-control';

export const resultsModule: ModuleDefinition<
  | 'commandBus'
  | 'database'
  | 'queryBus'
  | 'ipcRouter'
  | 'competitionTypeRegistry'
  | 'resultRepository'
  | 'finalResultRepository'
  | 'mixedTeamFinalResultRepository'
  | 'competitionShotJournal'
  | 'qualificationResultsReader'
  | 'finalResultsReader'
> = {
  name: 'results',
  deps: [
    'commandBus',
    'database',
    'queryBus',
    'ipcRouter',
    'competitionTypeRegistry',
    'resultRepository',
    'finalResultRepository',
    'mixedTeamFinalResultRepository',
    'competitionShotJournal',
    'qualificationResultsReader',
    'finalResultsReader',
  ] as const,
  register(ctx) {
    const {
      commandBus,
      database,
      queryBus,
      ipcRouter,
      competitionTypeRegistry,
      resultRepository,
      finalResultRepository,
      mixedTeamFinalResultRepository,
      competitionShotJournal,
      qualificationResultsReader,
      finalResultsReader,
    } = ctx;

    // 1. Command Handlers (token-based registration)
    const publishResultsHandler = new PublishResultsHandler(queryBus, resultRepository, competitionTypeRegistry);
    const publishMqttResultsHandler = new PublishMqttResultsHandler(
      queryBus,
      resultRepository,
      competitionTypeRegistry,
      competitionShotJournal,
    );
    const publishMqttFinalResultsHandler = new PublishMqttFinalResultsHandler(
      queryBus,
      finalResultRepository,
      competitionTypeRegistry,
      new SqliteFinalControlRepository(database),
    );
    const publishMqttMixedTeamFinalResultsHandler = new PublishMqttMixedTeamFinalResultsHandler(
      queryBus,
      mixedTeamFinalResultRepository,
      competitionTypeRegistry,
      new SqliteMixedTeamFinalControlRepository(database),
    );
    const publishFinalResultsHandler = new PublishFinalResultsHandler(
      queryBus,
      finalResultRepository,
      competitionTypeRegistry,
    );
    const confirmResultsHandler = new ConfirmResultsHandler(resultRepository);

    commandBus.register(PublishResultsToken, (input) => publishResultsHandler.execute(input));
    commandBus.register(PublishMqttResultsToken, (input) => publishMqttResultsHandler.execute(input));
    commandBus.register(PublishMqttFinalResultsToken, (input) => publishMqttFinalResultsHandler.execute(input));
    commandBus.register(PublishMqttMixedTeamFinalResultsToken, (input) =>
      publishMqttMixedTeamFinalResultsHandler.execute(input),
    );
    commandBus.register(PublishFinalResultsToken, (input) => publishFinalResultsHandler.execute(input));
    commandBus.register(ConfirmResultsToken, async (input) => confirmResultsHandler.execute(input));

    // 2. IPC Registration — queries through public readers, commands via bus
    ipcRouter.register(resultsContract, {
      // --- Commands (delegated to handlers via CommandBus) ---
      publish: (input) => commandBus.execute(PublishResultsToken, input),
      publishFinal: (input) => commandBus.execute(PublishFinalResultsToken, input),
      confirm: (input) => commandBus.execute(ConfirmResultsToken, input),

      // --- Queries (inlined) ---

      getByRelay: async (input): Promise<GetRelayResultsResponse> => {
        const resultDtos = await qualificationResultsReader.getByRelay(input.eventId, input.relayNumber);
        return {
          eventId: input.eventId,
          relayNumber: input.relayNumber,
          results: resultDtos,
        };
      },

      getByEvent: async (input): Promise<GetEventResultsResponse> => {
        const resultDtos = await qualificationResultsReader.getByEvent(input.eventId);
        return {
          eventId: input.eventId,
          results: resultDtos,
        };
      },

      getFinalByEvent: async (input): Promise<GetFinalEventResultsResponse> => {
        return {
          eventId: input.eventId,
          results: await finalResultsReader.getByEvent(input.eventId),
        };
      },
    });
  },
};
