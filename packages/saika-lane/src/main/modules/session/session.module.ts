// SPDX-License-Identifier: MIT
import type { InferHandlers } from '@sasakiuri/saika-ipc';

import type { ModuleDefinition } from '@/main/composition/ModuleDefinition';
import {
  GetSessionScoreToken,
  GetShotHistoryToken,
  RecordShotToken,
  ResetSessionToken,
  StartSessionToken,
  SwitchModeToken,
} from '@/main/composition/tokens';
import { Discipline } from '@/main/modules/session/domain/Discipline';
import { ImpactPoint } from '@/main/modules/session/domain/ImpactPoint';
import { Mode } from '@/main/modules/session/domain/Mode';
import { sessionContract } from '@/shared/ipc/contracts';

import { createGetSessionScoreHandler } from './application/handlers/GetSessionScoreHandler';
import { createGetShotHistoryHandler } from './application/handlers/GetShotHistoryHandler';
import { createRecordShotHandler } from './application/handlers/RecordShotHandler';
import { createResetSessionHandler } from './application/handlers/ResetSessionHandler';
import { createStartSessionHandler } from './application/handlers/StartSessionHandler';
import { createSwitchModeHandler } from './application/handlers/SwitchModeHandler';
import { ScoreDiscrepancyDetector } from './domain/ScoreDiscrepancyDetector';
import { CsvScoreDiscrepancyLogger } from './infra/CsvScoreDiscrepancyLogger';
import { ScoreCalculationServiceImpl } from './infra/ScoreCalculationServiceImpl';
import { ShotLogService } from './infra/ShotLogService';

type SessionDeps =
  | 'commandBus'
  | 'queryBus'
  | 'eventBus'
  | 'sessionRepository'
  | 'competitionRepository'
  | 'applyShotProgress'
  | 'ipcRouter'
  | 'userDataPath'
  | 'shotObservationRepository';

export const sessionModule: ModuleDefinition<SessionDeps> = {
  name: 'session',
  deps: [
    'commandBus',
    'queryBus',
    'eventBus',
    'sessionRepository',
    'competitionRepository',
    'applyShotProgress',
    'ipcRouter',
    'userDataPath',
    'shotObservationRepository',
  ] as const,
  register({
    commandBus,
    queryBus,
    eventBus,
    sessionRepository,
    competitionRepository,
    applyShotProgress,
    ipcRouter,
    userDataPath,
    shotObservationRepository,
  }) {
    const scoreService = new ScoreCalculationServiceImpl();
    const discrepancyLogger = new CsvScoreDiscrepancyLogger();
    const discrepancyDetector = new ScoreDiscrepancyDetector(discrepancyLogger);
    const shotLogService = new ShotLogService(userDataPath);

    // Subscribe ShotLogService to domain events
    eventBus.on('SessionStarted', (event) => shotLogService.handleSessionStarted(event));
    eventBus.on('ShotRecorded', (event) => shotLogService.handleShotRecorded(event));

    // Register CQRS handlers
    commandBus.register(StartSessionToken, createStartSessionHandler(sessionRepository, eventBus));
    commandBus.register(
      RecordShotToken,
      createRecordShotHandler(sessionRepository, scoreService, eventBus, discrepancyDetector, applyShotProgress),
    );
    commandBus.register(SwitchModeToken, createSwitchModeHandler(sessionRepository, eventBus));
    commandBus.register(ResetSessionToken, createResetSessionHandler(sessionRepository, eventBus));

    queryBus.register(GetSessionScoreToken, createGetSessionScoreHandler(sessionRepository));
    queryBus.register(
      GetShotHistoryToken,
      createGetShotHistoryHandler(sessionRepository, shotObservationRepository, competitionRepository),
    );

    // Register IPC handlers via IpcRouter
    const sessionHandlers: InferHandlers<typeof sessionContract> = {
      startSession: async (input) => {
        const discipline = Discipline.fromValue(input.discipline);
        const { sessionId } = await commandBus.execute(StartSessionToken, { discipline });
        return { sessionId };
      },

      recordShot: async (input) => {
        const impactPoint =
          input.impactPoint !== null ? new ImpactPoint(input.impactPoint.x, input.impactPoint.y) : null;
        const timestamp = new Date(input.timestamp);
        const competition = await competitionRepository.findBySessionId(input.sessionId);

        await commandBus.execute(RecordShotToken, {
          sessionId: input.sessionId,
          impactPoint,
          timestamp,
          ...(competition
            ? {
                competitionContext: {
                  competitionId: competition.id,
                  stageIndex: competition.currentStageIndex,
                  seriesIndex: competition.currentSeriesIndex,
                },
              }
            : {}),
        });
      },

      switchMode: async (input) => {
        const mode = Mode.fromValue(input.mode);

        await commandBus.execute(SwitchModeToken, {
          sessionId: input.sessionId,
          mode,
        });
      },

      resetSession: async (input) => {
        await commandBus.execute(ResetSessionToken, {
          sessionId: input.sessionId,
        });
      },

      getSessionScore: async (input) => {
        return await queryBus.execute(GetSessionScoreToken, {
          sessionId: input.sessionId,
        });
      },

      getShotHistory: async (input) => {
        return await queryBus.execute(GetShotHistoryToken, {
          sessionId: input.sessionId,
        });
      },
    };

    ipcRouter.register(sessionContract, sessionHandlers);
  },
};
