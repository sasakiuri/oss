// SPDX-License-Identifier: MIT
import type { InferHandlers } from '@sasakiuri/saika-ipc';

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
  | 'competitionInterruptionControl'
  | 'competitionTypes';

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
    'competitionTypes',
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
    competitionTypes,
  }) {
    // 1. Instantiate SessionLifecycleService
    const sessionLifecycle = new SessionLifecycleService(sessionRepository, eventBus);

    // 2. Register CQRS handlers (7 commands + 2 queries)
    commandBus.register(
      StartCompetitionToken,
      createStartCompetitionHandler(competitionTypes, competitionRepository, sessionRepository, eventBus),
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
    queryBus.register(GetCompetitionTypesToken, createGetCompetitionTypesHandler(competitionTypes));

    // 3. Register event listeners
    eventBus.on('PhaseChanged', createPhaseChangedHandler({ competitionRepository, timerService }));
    eventBus.on(
      'TimedTargetSequenceChanged',
      createTimedTargetSequenceChangedHandler({ competitionRepository, eventBus }),
    );

    // 4. Register IPC handlers
    const requireLocalProgress = async (create = false) => {
      // While joined, Director alone runs the competition; its commands do not pass through these handlers.
      if (membership.snapshot.competitionId !== null) {
        throw new Error('Competition progress is controlled by Director');
      }
      const ready = await startup.snapshot();
      const active = await competitionRepository.findActive();
      const interruption = active ? competitionInterruptionControl.get(active.id) : null;
      if (
        (ready.status !== 'READY' && !(create && ready.canChooseType && !active)) ||
        interruption?.status === 'PAUSED' ||
        interruption?.status === 'RESUME_PENDING'
      ) {
        throw new Error('Restore or finish the saved run before starting again');
      }
    };
    const competitionHandlers: InferHandlers<typeof competitionContract> = {
      startCompetition: async (input) => {
        await requireLocalProgress(true);
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
        await startup.snapshot();
        if (membership.snapshot.competitionId !== null || safetyStopControl.isStopped())
          throw new Error('Clear Director membership and the safety stop before finishing the saved run');
        await commandBus.execute(FinishCompetitionToken, {
          competitionId: input.competitionId,
        });
        competitionInterruptionControl.clear(input.competitionId);
      },
      setAthleteTargetMode: async (input) => commandBus.execute(SetAthleteTargetModeToken, input),
      getCompetitionState: async (input) => {
        const state = await queryBus.execute(GetCompetitionStateToken, {
          competitionId: input.competitionId,
        });
        return { ...state, timer: { ...state.timer, running: timerService.sample(state.id)?.running === true } };
      },
      getCompetitionTypes: async () => {
        return await queryBus.execute(GetCompetitionTypesToken, undefined);
      },
    };

    ipcRouter.register(competitionContract, competitionHandlers);
  },
};
