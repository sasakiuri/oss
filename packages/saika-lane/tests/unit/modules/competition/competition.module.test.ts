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
  SetAthleteTargetModeToken,
  GetCompetitionTypesToken,
  StartCompetitionToken,
  StartNextSeriesToken,
  StartStageToken,
} from '@/main/composition/tokens';
import { competitionModule } from '@/main/modules/competition/competition.module';
import type { ICompetitionInterruptionControl } from '@/main/modules/competition-interruption';
import { DirectorMembership } from '@/main/modules/mqtt/application/DirectorMembership';
import { competitionContract } from '@/shared/ipc/contracts';

import {
  createMockStartup,
  createMockStorage,
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

  function registerModule(startup = createMockStartup()) {
    competitionModule.register({
      startup,
      membership: new DirectorMembership(createMockStorage(), eventBus),
      safetyStopControl: { isStopped: () => false } as import('@/main/modules/safety-stop').ILaneSafetyStopControl,
      commandBus,
      queryBus,
      eventBus,
      sessionRepository,
      competitionRepository,
      ipcRouter,
      timerService,
      competitionInterruptionControl: { get: () => null } as unknown as ICompetitionInterruptionControl,
    });
  }

  describe('metadata', () => {
    it('should have name "competition"', () => {
      expect(competitionModule.name).toBe('competition');
    });

    it('should declare correct dependencies', () => {
      expect(competitionModule.deps).toEqual([
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
      ]);
    });
  });

  describe('register', () => {
    it('should register 7 command handlers', () => {
      registerModule();

      expect(commandBus.register).toHaveBeenCalledTimes(7);
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

    it('permits the explicit existing creator for an unknown saved type only while no run is active', async () => {
      const startup = createMockStartup();
      vi.mocked(startup.snapshot).mockResolvedValue({
        status: 'ERROR',
        error: 'Unknown type',
        competitionId: null,
        sessionId: null,
        canFinish: false,
        currentSeriesStartIndex: 0,
        canChooseType: true,
      });
      registerModule(startup);
      vi.mocked(commandBus.execute).mockResolvedValue({ competitionId: 'new', sessionId: 'session' });
      const handlers = vi.mocked(ipcRouter.register).mock.calls[0]![1] as {
        startCompetition(input: { competitionTypeId: string }): Promise<unknown>;
      };
      await handlers.startCompetition({ competitionTypeId: 'AR60' });
      expect(commandBus.execute).toHaveBeenCalledWith(StartCompetitionToken, { competitionTypeId: 'AR60' });
    });

    it('routes the athlete IPC command through its dedicated CQRS handler', async () => {
      registerModule();
      expect(commandBus.register).toHaveBeenCalledWith(SetAthleteTargetModeToken, expect.any(Function));
      const handlers = vi.mocked(ipcRouter.register).mock.calls[0]![1] as any;
      const input = { competitionId: 'comp-1', stageIndex: 1, seriesIndex: 2, mode: 'MATCH' };
      await handlers.setAthleteTargetMode(input);
      expect(commandBus.execute).toHaveBeenCalledWith(SetAthleteTargetModeToken, input);
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

    it('does not subscribe progress to the unawaited ShotRecorded event', () => {
      registerModule();

      expect(eventBus.on).not.toHaveBeenCalledWith('ShotRecorded', expect.any(Function));
    });

    it('should subscribe to PhaseChanged event', () => {
      registerModule();

      expect(eventBus.on).toHaveBeenCalledWith('PhaseChanged', expect.any(Function));
    });
  });
});
