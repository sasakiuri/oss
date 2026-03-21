// SPDX-License-Identifier: MIT
/**
 * Competition module definition
 *
 * Registers command/query handlers, event listeners, and IPC handlers for competition management.
 */

import type { ModuleDefinition } from '@/main/composition/ModuleDefinition';
import {
  AdvanceStageToken,
  EndStageToken,
  FinishCompetitionToken,
  GetCompetitionStateToken,
  GetCompetitionTypesToken,
  StartCompetitionToken,
  StartNextSeriesToken,
  StartStageToken,
} from '@/main/composition/tokens';
import { competitionContract } from '@/shared/ipc/contracts';
import type { InferHandlers } from '@/shared/ipc/defineContract';

import { createPhaseChangedHandler, createShotRecordedHandler } from './application/CompetitionEventHandlers';
import { createAdvanceStageHandler } from './application/handlers/AdvanceStageHandler';
import { createEndStageHandler } from './application/handlers/EndStageHandler';
import { createFinishCompetitionHandler } from './application/handlers/FinishCompetitionHandler';
import { createGetCompetitionStateHandler } from './application/handlers/GetCompetitionStateHandler';
import { createGetCompetitionTypesHandler } from './application/handlers/GetCompetitionTypesHandler';
import { createStartCompetitionHandler } from './application/handlers/StartCompetitionHandler';
import { createStartNextSeriesHandler } from './application/handlers/StartNextSeriesHandler';
import { createStartStageHandler } from './application/handlers/StartStageHandler';
import { SessionLifecycleService } from './application/SessionLifecycleService';
import { CompetitionTypeRegistry } from './domain/CompetitionTypeRegistry';
import { ALL_COMPETITION_TYPES } from './domain/competitionTypes';

type CompetitionDeps =
  | 'commandBus'
  | 'queryBus'
  | 'eventBus'
  | 'sessionRepository'
  | 'competitionRepository'
  | 'ipcRouter'
  | 'timerService';

export const competitionModule: ModuleDefinition<CompetitionDeps> = {
  name: 'competition',
  deps: [
    'commandBus',
    'queryBus',
    'eventBus',
    'sessionRepository',
    'competitionRepository',
    'ipcRouter',
    'timerService',
  ] as const,
  register({ commandBus, queryBus, eventBus, sessionRepository, competitionRepository, ipcRouter, timerService }) {
    // 1. Register competition types in CompetitionTypeRegistry
    const registry = new CompetitionTypeRegistry();
    for (const typeDef of ALL_COMPETITION_TYPES) {
      registry.register(typeDef);
    }

    // 2. Instantiate SessionLifecycleService
    const sessionLifecycle = new SessionLifecycleService(sessionRepository, eventBus);

    // 3. Register CQRS handlers (6 commands + 2 queries)
    commandBus.register(
      StartCompetitionToken,
      createStartCompetitionHandler(registry, competitionRepository, sessionRepository, eventBus),
    );
    commandBus.register(StartStageToken, createStartStageHandler(competitionRepository, sessionLifecycle, eventBus));
    commandBus.register(StartNextSeriesToken, createStartNextSeriesHandler(competitionRepository, eventBus));
    commandBus.register(
      AdvanceStageToken,
      createAdvanceStageHandler(competitionRepository, sessionLifecycle, eventBus),
    );
    commandBus.register(
      FinishCompetitionToken,
      createFinishCompetitionHandler(competitionRepository, sessionRepository, eventBus),
    );
    commandBus.register(EndStageToken, createEndStageHandler(competitionRepository, eventBus));
    queryBus.register(GetCompetitionStateToken, createGetCompetitionStateHandler(competitionRepository));
    queryBus.register(GetCompetitionTypesToken, createGetCompetitionTypesHandler(registry));

    // 4. Register event listeners
    eventBus.on('ShotRecorded', createShotRecordedHandler({ competitionRepository, eventBus }));
    eventBus.on('PhaseChanged', createPhaseChangedHandler({ competitionRepository, timerService }));

    // 5. Register IPC handlers
    const competitionHandlers: InferHandlers<typeof competitionContract> = {
      startCompetition: async (input) => {
        const result = await commandBus.execute(StartCompetitionToken, {
          competitionTypeId: input.competitionTypeId,
        });
        return { competitionId: result.competitionId, sessionId: result.sessionId };
      },
      startStage: async (input) => {
        const result = await commandBus.execute(StartStageToken, {
          competitionId: input.competitionId,
        });
        return { sessionId: result.sessionId };
      },
      startNextSeries: async (input) => {
        await commandBus.execute(StartNextSeriesToken, {
          competitionId: input.competitionId,
        });
      },
      advanceStage: async (input) => {
        await commandBus.execute(AdvanceStageToken, {
          competitionId: input.competitionId,
        });
      },
      endStage: async (input) => {
        await commandBus.execute(EndStageToken, {
          competitionId: input.competitionId,
        });
      },
      finishCompetition: async (input) => {
        await commandBus.execute(FinishCompetitionToken, {
          competitionId: input.competitionId,
        });
      },
      getCompetitionState: async (input) => {
        return await queryBus.execute(GetCompetitionStateToken, {
          competitionId: input.competitionId,
        });
      },
      getCompetitionTypes: async () => {
        return await queryBus.execute(GetCompetitionTypesToken, undefined);
      },
    };

    ipcRouter.register(competitionContract, competitionHandlers);
  },
};
