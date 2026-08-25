/**
 * Results Module Registration
 *
 * Registers all results-related command handlers, query handlers,
 * and IPC handlers. Repositories are created internally.
 *
 * Commands (PublishResults, PublishFinalResults, ConfirmResults) are kept
 * as separate handler classes because they orchestrate cross-module logic.
 * Queries are inlined directly into IPC handler callbacks.
 */
import type { ModuleDefinition } from '@/main/shared-infra/module/ModuleDefinition';

// Repositories
import { SqliteResultRepository } from './infra/SqliteResultRepository';
import { SqliteFinalResultRepository } from './infra/SqliteFinalResultRepository';

// Domain Services
import { RankingService } from './domain/RankingService';

// Command handlers (kept as classes — cross-module orchestration)
import { PublishResultsHandler } from './commands/PublishResultsHandler';
import { PublishMqttResultsHandler } from './commands/PublishMqttResultsHandler';
import { PublishFinalResultsHandler } from './commands/PublishFinalResultsHandler';
import { ConfirmResultsHandler } from './commands/ConfirmResultsHandler';

// IPC Contract & response types
import { resultsContract } from '@/shared/ipc/contracts';
import type {
  RankedResultDto,
  FinalRankedResultDto,
  GetEventResultsResponse,
  GetRelayResultsResponse,
  GetFinalEventResultsResponse,
} from '@/shared/ipc/contracts/results.contract';

// Command Tokens (kept for cross-module command dispatch)
import { PublishResultsToken, PublishMqttResultsToken, PublishFinalResultsToken, ConfirmResultsToken } from './tokens';

export const resultsModule: ModuleDefinition<
  'database' | 'commandBus' | 'queryBus' | 'ipcRouter' | 'competitionTypeRegistry'
> = {
  name: 'results',
  deps: ['database', 'commandBus', 'queryBus', 'ipcRouter', 'competitionTypeRegistry'] as const,
  register(ctx) {
    const { database, commandBus, queryBus, ipcRouter, competitionTypeRegistry } = ctx;

    // 1. Create repositories & services internally
    const resultRepository = new SqliteResultRepository(database);
    const finalResultRepository = new SqliteFinalResultRepository(database);
    const rankingService = new RankingService();

    // 2. Command Handlers (token-based registration)
    const publishResultsHandler = new PublishResultsHandler(queryBus, resultRepository, competitionTypeRegistry);
    const publishMqttResultsHandler = new PublishMqttResultsHandler(
      queryBus,
      resultRepository,
      competitionTypeRegistry,
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

    // 3. IPC Registration — queries inlined, commands via bus
    ipcRouter.register(resultsContract, {
      // --- Commands (delegated to handlers via CommandBus) ---
      publish: (input) => commandBus.execute(PublishResultsToken, input),
      publishFinal: (input) => commandBus.execute(PublishFinalResultsToken, input),
      confirm: (input) => commandBus.execute(ConfirmResultsToken, input),

      // --- Queries (inlined) ---

      getByRelay: async (input): Promise<GetRelayResultsResponse> => {
        const results = resultRepository.findByEventIdAndRelay(input.eventId, input.relayNumber);
        const rankedResults = rankingService.calculateRankings(results);
        const resultDtos: RankedResultDto[] = rankedResults.map((ranked) => ({
          id: ranked.result.id.value,
          rank: ranked.rank,
          playerName: ranked.result.playerName,
          affiliation: ranked.result.affiliation,
          relayNumber: ranked.result.relayNumber,
          seriesScores: [...ranked.result.seriesScores],
          totalScore: ranked.result.totalScore,
          confirmedAt: ranked.result.confirmedAt.toISOString(),
          status: ranked.result.status,
        }));
        return {
          eventId: input.eventId,
          relayNumber: input.relayNumber,
          results: resultDtos,
        };
      },

      getByEvent: async (input): Promise<GetEventResultsResponse> => {
        const results = resultRepository.findByEventId(input.eventId);
        const rankedResults = rankingService.calculateRankings(results);
        const resultDtos: RankedResultDto[] = rankedResults.map((ranked) => ({
          id: ranked.result.id.value,
          rank: ranked.rank,
          playerName: ranked.result.playerName,
          affiliation: ranked.result.affiliation,
          relayNumber: ranked.result.relayNumber,
          seriesScores: [...ranked.result.seriesScores],
          totalScore: ranked.result.totalScore,
          confirmedAt: ranked.result.confirmedAt.toISOString(),
          status: ranked.result.status,
        }));
        return {
          eventId: input.eventId,
          results: resultDtos,
        };
      },

      getFinalByEvent: async (input): Promise<GetFinalEventResultsResponse> => {
        const results = finalResultRepository.findByEventId(input.eventId);

        const sortedResults = [...results].sort((a, b) => {
          if (a.eliminatedAtShot !== undefined && b.eliminatedAtShot !== undefined) {
            return b.eliminatedAtShot - a.eliminatedAtShot;
          }
          if (a.eliminatedAtShot !== undefined && b.eliminatedAtShot === undefined) return 1;
          if (a.eliminatedAtShot === undefined && b.eliminatedAtShot !== undefined) return -1;
          return b.totalScore - a.totalScore;
        });

        const resultDtos: FinalRankedResultDto[] = sortedResults.map((result, index) => ({
          id: result.id.value,
          rank: result.finalRank > 0 ? result.finalRank : index + 1,
          playerName: result.playerName,
          affiliation: result.affiliation,
          firingPointNumber: result.firingPointNumber,
          stage1Shots: [...result.stage1Shots],
          stage1Total: result.stage1Total,
          stage2Shots: [...result.stage2Shots],
          stage2Total: result.stage2Total,
          totalScore: result.totalScore,
          eliminatedAtShot: result.eliminatedAtShot,
          shootoffId: result.shootoffId,
          remarks: result.remarks,
          status: result.status,
        }));

        return {
          eventId: input.eventId,
          results: resultDtos,
        };
      },
    });
  },
};
