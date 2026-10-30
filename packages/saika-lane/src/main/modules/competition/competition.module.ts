// SPDX-License-Identifier: MIT
import type { ModuleDefinition } from '@/main/composition/ModuleDefinition';
import {
  AdvanceStageToken,
  EndStageToken,
  FinishCompetitionToken,
  GetCompetitionStateToken,
  SetAthleteTargetModeToken,
  GetCompetitionTypesToken,
  StartCompetitionToken,
  StartNextSeriesToken,
  StartStageToken,
} from '@/main/composition/tokens';
import { competitionContract } from '@/shared/ipc/contracts';
import type { InferHandlers } from '@/shared/ipc/defineContract';

import {
  createPhaseChangedHandler,
  createTimedTargetSequenceChangedHandler,
} from './application/CompetitionEventHandlers';
import { createAdvanceStageHandler } from './application/handlers/AdvanceStageHandler';
import { createEndStageHandler } from './application/handlers/EndStageHandler';
import { createFinishCompetitionHandler } from './application/handlers/FinishCompetitionHandler';
import { createGetCompetitionStateHandler } from './application/handlers/GetCompetitionStateHandler';
import { createGetCompetitionTypesHandler } from './application/handlers/GetCompetitionTypesHandler';
import { createSetAthleteTargetModeHandler } from './application/handlers/SetAthleteTargetModeHandler';
import { createStartCompetitionHandler } from './application/handlers/StartCompetitionHandler';
import { createStartNextSeriesHandler } from './application/handlers/StartNextSeriesHandler';
import { createStartStageHandler } from './application/handlers/StartStageHandler';
import { SessionLifecycleService } from './application/SessionLifecycleService';
import { CompetitionTypeRegistry } from './domain/CompetitionTypeRegistry';
import { ALL_COMPETITION_TYPES } from './domain/competitionTypes';

type CompetitionDeps =
  | 'membership'
  | 'safetyStopControl'
  | 'startup'
  | 'commandBus'
  | 'queryBus'
  | 'eventBus'
  | 'sessionRepository'
  | 'competitionRepository'
  | 'ipcRouter'
  | 'timerService'
  | 'competitionInterruptionControl';

export const competitionModule: ModuleDefinition<CompetitionDeps> = {
  name: 'competition',
  deps: [
    'membership',
    'safetyStopControl',
    'startup',
    'commandBus',
    'queryBus',
    'eventBus',
    'sessionRepository',
    'competitionRepository',
    'ipcRouter',
    'timerService',
    'competitionInterruptionControl',
  ] as const,
  register({
    membership,
    safetyStopControl,
    startup,
    commandBus,
    queryBus,
    eventBus,
    sessionRepository,
    competitionRepository,
    ipcRouter,
    timerService,
    competitionInterruptionControl,
  }) {
    // 1. Register competition types in CompetitionTypeRegistry
    const registry = new CompetitionTypeRegistry();
    for (const typeDef of ALL_COMPETITION_TYPES) {
      registry.register(typeDef);
    }

    // 2. Instantiate SessionLifecycleService
    const sessionLifecycle = new SessionLifecycleService(sessionRepository, eventBus);

    // 3. Register CQRS handlers (7 commands + 2 queries)
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
    commandBus.register(
      SetAthleteTargetModeToken,
      createSetAthleteTargetModeHandler(
        competitionRepository,
        eventBus,
        competitionInterruptionControl,
        sessionRepository,
      ),
    );
    queryBus.register(
      GetCompetitionStateToken,
      createGetCompetitionStateHandler(competitionRepository, sessionRepository, competitionInterruptionControl),
    );
    queryBus.register(GetCompetitionTypesToken, createGetCompetitionTypesHandler(registry));

    // 4. Register event listeners
    eventBus.on('PhaseChanged', createPhaseChangedHandler({ competitionRepository, timerService }));
    eventBus.on(
      'TimedTargetSequenceChanged',
      createTimedTargetSequenceChangedHandler({ competitionRepository, eventBus }),
    );

    // 5. Register IPC handlers
    const requireLocalProgress = async () => {
      const ready = await startup.snapshot();
      const active = await competitionRepository.findActive();
      const interruption = active ? competitionInterruptionControl.get(active.id) : null;
      if (ready.status !== 'READY' || interruption?.status === 'PAUSED' || interruption?.status === 'RESUME_PENDING') {
        throw new Error('Restore or finish the saved run before starting again');
      }
    };
    const competitionHandlers: InferHandlers<typeof competitionContract> = {
      startCompetition: async (input) => {
        await requireLocalProgress();
        const result = await commandBus.execute(StartCompetitionToken, {
          competitionTypeId: input.competitionTypeId,
        });
        return { competitionId: result.competitionId, sessionId: result.sessionId };
      },
      startStage: async (input) => {
        await requireLocalProgress();
        const result = await commandBus.execute(StartStageToken, {
          competitionId: input.competitionId,
        });
        return { sessionId: result.sessionId };
      },
      startNextSeries: async (input) => {
        await requireLocalProgress();
        await commandBus.execute(StartNextSeriesToken, {
          competitionId: input.competitionId,
        });
      },
      advanceStage: async (input) => {
        await requireLocalProgress();
        await commandBus.execute(AdvanceStageToken, {
          competitionId: input.competitionId,
        });
      },
      endStage: async (input) => {
        await requireLocalProgress();
        await commandBus.execute(EndStageToken, {
          competitionId: input.competitionId,
        });
      },
      finishCompetition: async (input) => {
        if (membership.snapshot.competitionId !== null || safetyStopControl.isStopped())
          throw new Error('Clear Director membership and the safety stop before finishing the saved run');
        await commandBus.execute(FinishCompetitionToken, {
          competitionId: input.competitionId,
        });
      },
      setAthleteTargetMode: async (input) => commandBus.execute(SetAthleteTargetModeToken, input),
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
