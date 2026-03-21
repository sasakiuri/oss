// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/main/shared-infra/logging/createLogger', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
  initializeLogger: vi.fn(),
  resetLogger: vi.fn(),
}));

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
import { competitionModule } from '@/main/modules/competition/competition.module';
import { competitionContract } from '@/shared/ipc/contracts';

import {
  createMockCommandBus,
  createMockCompetitionRepository,
  createMockEventBus,
  createMockIpcRouter,
  createMockQueryBus,
  createMockSessionRepository,
  createMockTimerService,
} from '../../../helpers/mockDependencies';

describe('competition.module', () => {
  let commandBus: ReturnType<typeof createMockCommandBus>;
  let queryBus: ReturnType<typeof createMockQueryBus>;
  let eventBus: ReturnType<typeof createMockEventBus>;
  let ipcRouter: ReturnType<typeof createMockIpcRouter>;
  let sessionRepository: ReturnType<typeof createMockSessionRepository>;
  let competitionRepository: ReturnType<typeof createMockCompetitionRepository>;
  let timerService: ReturnType<typeof createMockTimerService>;

  beforeEach(() => {
    commandBus = createMockCommandBus();
    queryBus = createMockQueryBus();
    eventBus = createMockEventBus();
    ipcRouter = createMockIpcRouter();
    sessionRepository = createMockSessionRepository();
    competitionRepository = createMockCompetitionRepository();
    timerService = createMockTimerService();
  });

  function registerModule() {
    competitionModule.register({
      commandBus,
      queryBus,
      eventBus,
      sessionRepository,
      competitionRepository,
      ipcRouter,
      timerService,
    });
  }

  describe('metadata', () => {
    it('should have name "competition"', () => {
      expect(competitionModule.name).toBe('competition');
    });

    it('should declare correct dependencies', () => {
      expect(competitionModule.deps).toEqual([
        'commandBus',
        'queryBus',
        'eventBus',
        'sessionRepository',
        'competitionRepository',
        'ipcRouter',
        'timerService',
      ]);
    });
  });

  describe('register', () => {
    it('should register 6 command handlers', () => {
      registerModule();

      expect(commandBus.register).toHaveBeenCalledTimes(6);
    });

    it('should register StartCompetition command handler', () => {
      registerModule();

      expect(commandBus.register).toHaveBeenCalledWith(StartCompetitionToken, expect.any(Function));
    });

    it('should register StartStage command handler', () => {
      registerModule();

      expect(commandBus.register).toHaveBeenCalledWith(StartStageToken, expect.any(Function));
    });

    it('should register StartNextSeries command handler', () => {
      registerModule();

      expect(commandBus.register).toHaveBeenCalledWith(StartNextSeriesToken, expect.any(Function));
    });

    it('should register AdvanceStage command handler', () => {
      registerModule();

      expect(commandBus.register).toHaveBeenCalledWith(AdvanceStageToken, expect.any(Function));
    });

    it('should register EndStage command handler', () => {
      registerModule();

      expect(commandBus.register).toHaveBeenCalledWith(EndStageToken, expect.any(Function));
    });

    it('should register FinishCompetition command handler', () => {
      registerModule();

      expect(commandBus.register).toHaveBeenCalledWith(FinishCompetitionToken, expect.any(Function));
    });

    it('should register 2 query handlers', () => {
      registerModule();

      expect(queryBus.register).toHaveBeenCalledTimes(2);
    });

    it('should register GetCompetitionState query handler', () => {
      registerModule();

      expect(queryBus.register).toHaveBeenCalledWith(GetCompetitionStateToken, expect.any(Function));
    });

    it('should register GetCompetitionTypes query handler', () => {
      registerModule();

      expect(queryBus.register).toHaveBeenCalledWith(GetCompetitionTypesToken, expect.any(Function));
    });

    it('should register IPC handlers with competitionContract', () => {
      registerModule();

      expect(ipcRouter.register).toHaveBeenCalledTimes(1);
      expect(ipcRouter.register).toHaveBeenCalledWith(competitionContract, expect.any(Object));
    });

    it('should subscribe to ShotRecorded event', () => {
      registerModule();

      expect(eventBus.on).toHaveBeenCalledWith('ShotRecorded', expect.any(Function));
    });

    it('should subscribe to PhaseChanged event', () => {
      registerModule();

      expect(eventBus.on).toHaveBeenCalledWith('PhaseChanged', expect.any(Function));
    });
  });
});
