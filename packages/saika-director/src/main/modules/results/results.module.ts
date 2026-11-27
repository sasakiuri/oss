import { defineModule } from '@/main/shared-infra/module/ModuleDefinition';

// Command handlers (kept as classes — cross-module orchestration)
import { PublishMqttResultsHandler } from './application/commands/PublishMqttResultsHandler';
import { PublishMqttFinalResultsHandler } from './application/commands/PublishMqttFinalResultsHandler';
import { PublishMqttMixedTeamFinalResultsHandler } from './application/commands/PublishMqttMixedTeamFinalResultsHandler';
import { ConfirmResultsHandler } from './application/commands/ConfirmResultsHandler';

// IPC Contract & response types
import { resultsContract } from '@/shared/ipc/contracts';
import type {
  GetEventResultsResponse,
  GetRelayResultsResponse,
  GetFinalEventResultsResponse,
} from '@/shared/ipc/contracts';

// Command Tokens (kept for cross-module command dispatch)
import {
  PublishMqttResultsToken,
  PublishMqttFinalResultsToken,
  PublishMqttMixedTeamFinalResultsToken,
  ConfirmResultsToken,
} from './application/tokens';

export const resultsModule = defineModule({
  name: 'results',
  deps: [
    'commandBus',
    'queryBus',
    'ipcRouter',
    'competitionTypeRegistry',
    'resultRepository',
    'finalResultRepository',
    'mixedTeamFinalResultRepository',
    'competitionShotJournal',
    'qualificationResultsReader',
    'finalResultsReader',
    'finalControlRepository',
    'mixedTeamFinalControlRepository',
  ],
  register(ctx) {
    const {
      commandBus,
      queryBus,
      ipcRouter,
      competitionTypeRegistry,
      resultRepository,
      finalResultRepository,
      mixedTeamFinalResultRepository,
      competitionShotJournal,
      qualificationResultsReader,
      finalResultsReader,
      finalControlRepository,
      mixedTeamFinalControlRepository,
    } = ctx;

    // 1. Command Handlers (token-based registration)
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
      finalControlRepository,
    );
    const publishMqttMixedTeamFinalResultsHandler = new PublishMqttMixedTeamFinalResultsHandler(
      queryBus,
      mixedTeamFinalResultRepository,
      competitionTypeRegistry,
      mixedTeamFinalControlRepository,
    );
    const confirmResultsHandler = new ConfirmResultsHandler(resultRepository);

    commandBus.register(PublishMqttResultsToken, (input) => publishMqttResultsHandler.execute(input));
    commandBus.register(PublishMqttFinalResultsToken, (input) => publishMqttFinalResultsHandler.execute(input));
    commandBus.register(PublishMqttMixedTeamFinalResultsToken, (input) =>
      publishMqttMixedTeamFinalResultsHandler.execute(input),
    );
    commandBus.register(ConfirmResultsToken, async (input) => confirmResultsHandler.execute(input));

    // 2. IPC Registration — queries through public readers, commands via bus
    ipcRouter.register(resultsContract, {
      // --- Commands (delegated to handlers via CommandBus) ---
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
});
