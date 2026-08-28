/**
 * Results Module Registration
 *
 * Registers all results-related command handlers, query handlers,
 * and IPC handlers. Repositories and projection readers are injected as ports.
 *
 * Commands (PublishResults, PublishFinalResults, ConfirmResults) are kept
 * as separate handler classes because they orchestrate cross-module logic.
 * Queries are inlined directly into IPC handler callbacks.
 */
import type { ModuleDefinition } from '@/main/shared-infra/module/ModuleDefinition';

// Command handlers (kept as classes — cross-module orchestration)
import { PublishResultsHandler } from './commands/PublishResultsHandler';
import { PublishMqttResultsHandler } from './commands/PublishMqttResultsHandler';
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
import { PublishResultsToken, PublishMqttResultsToken, PublishFinalResultsToken, ConfirmResultsToken } from './tokens';

export const resultsModule: ModuleDefinition<
  | 'commandBus'
  | 'queryBus'
  | 'ipcRouter'
  | 'competitionTypeRegistry'
  | 'resultRepository'
  | 'finalResultRepository'
  | 'competitionShotJournal'
  | 'qualificationResultsReader'
  | 'finalResultsReader'
> = {
  name: 'results',
  deps: [
    'commandBus',
    'queryBus',
    'ipcRouter',
    'competitionTypeRegistry',
    'resultRepository',
    'finalResultRepository',
    'competitionShotJournal',
    'qualificationResultsReader',
    'finalResultsReader',
  ] as const,
  register(ctx) {
    const {
      commandBus,
      queryBus,
      ipcRouter,
      competitionTypeRegistry,
      resultRepository,
      finalResultRepository,
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
    const publishFinalResultsHandler = new PublishFinalResultsHandler(
      queryBus,
      finalResultRepository,
      competitionTypeRegistry,
    );
    const confirmResultsHandler = new ConfirmResultsHandler(resultRepository);

    commandBus.register(PublishResultsToken, (input) => publishResultsHandler.execute(input));
    commandBus.register(PublishMqttResultsToken, (input) => publishMqttResultsHandler.execute(input));
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
