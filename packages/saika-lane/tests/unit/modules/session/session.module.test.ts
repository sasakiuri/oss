// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/test-userData' },
}));
vi.mock('@/main/shared-infra/logging/createLogger', () => ({
  getLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import {
  GetSessionScoreToken,
  GetShotHistoryToken,
  RecordShotToken,
  ResetSessionToken,
  SwitchModeToken,
} from '@/main/composition/tokens';
import { sessionModule } from '@/main/modules/session/session.module';
import { SqliteShotObservationRepository } from '@/main/modules/shot-observation/infra/SqliteShotObservationRepository';
import { createSqliteDb } from '@/main/shared-infra/sqlite/SqliteDb';
import { sessionContract } from '@/shared/ipc/contracts';

import {
  createMockCommandBus,
  createMockEventBus,
  createMockIpcRouter,
  createMockQueryBus,
  createMockSessionRepository,
  createMockCompetitionRepository,
} from '../../../helpers/mockDependencies';

describe('session.module', () => {
  let database: ReturnType<typeof createSqliteDb>;
  afterEach(() => database.close());
  let commandBus: ReturnType<typeof createMockCommandBus>;
  let queryBus: ReturnType<typeof createMockQueryBus>;
  let eventBus: ReturnType<typeof createMockEventBus>;
  let ipcRouter: ReturnType<typeof createMockIpcRouter>;
  let sessionRepository: ReturnType<typeof createMockSessionRepository>;

  beforeEach(() => {
    database = createSqliteDb(':memory:');
    commandBus = createMockCommandBus();
    queryBus = createMockQueryBus();
    eventBus = createMockEventBus();
    ipcRouter = createMockIpcRouter();
    sessionRepository = createMockSessionRepository();
  });

  describe('metadata', () => {
    it('should have name "session"', () => {
      expect(sessionModule.name).toBe('session');
    });

    it('should declare correct dependencies', () => {
      expect(sessionModule.deps).toEqual([
        'commandBus',
        'queryBus',
        'eventBus',
        'sessionRepository',
        'competitionRepository',
        'applyShotProgress',
        'ipcRouter',
        'userDataPath',
        'shotObservationRepository',
      ]);
    });
  });

  describe('register', () => {
    it('should register 3 command handlers', () => {
      sessionModule.register({
        shotObservationRepository: new SqliteShotObservationRepository(database),
        commandBus,
        queryBus,
        eventBus,
        sessionRepository,
        competitionRepository: createMockCompetitionRepository(),
        applyShotProgress: vi.fn().mockResolvedValue(undefined),
        ipcRouter,
        userDataPath: '/tmp/test',
      });

      expect(commandBus.register).toHaveBeenCalledTimes(3);
    });

    it('should register RecordShot command handler', () => {
      sessionModule.register({
        shotObservationRepository: new SqliteShotObservationRepository(database),
        commandBus,
        queryBus,
        eventBus,
        sessionRepository,
        competitionRepository: createMockCompetitionRepository(),
        applyShotProgress: vi.fn().mockResolvedValue(undefined),
        ipcRouter,
        userDataPath: '/tmp/test',
      });

      expect(commandBus.register).toHaveBeenCalledWith(RecordShotToken, expect.any(Function));
    });

    it('should register SwitchMode command handler', () => {
      sessionModule.register({
        shotObservationRepository: new SqliteShotObservationRepository(database),
        commandBus,
        queryBus,
        eventBus,
        sessionRepository,
        competitionRepository: createMockCompetitionRepository(),
        applyShotProgress: vi.fn().mockResolvedValue(undefined),
        ipcRouter,
        userDataPath: '/tmp/test',
      });

      expect(commandBus.register).toHaveBeenCalledWith(SwitchModeToken, expect.any(Function));
    });

    it('should register ResetSession command handler', () => {
      sessionModule.register({
        shotObservationRepository: new SqliteShotObservationRepository(database),
        commandBus,
        queryBus,
        eventBus,
        sessionRepository,
        competitionRepository: createMockCompetitionRepository(),
        applyShotProgress: vi.fn().mockResolvedValue(undefined),
        ipcRouter,
        userDataPath: '/tmp/test',
      });

      expect(commandBus.register).toHaveBeenCalledWith(ResetSessionToken, expect.any(Function));
    });

    it('should register 2 query handlers', () => {
      sessionModule.register({
        shotObservationRepository: new SqliteShotObservationRepository(database),
        commandBus,
        queryBus,
        eventBus,
        sessionRepository,
        competitionRepository: createMockCompetitionRepository(),
        applyShotProgress: vi.fn().mockResolvedValue(undefined),
        ipcRouter,
        userDataPath: '/tmp/test',
      });

      expect(queryBus.register).toHaveBeenCalledTimes(2);
    });

    it('should register GetSessionScore query handler', () => {
      sessionModule.register({
        shotObservationRepository: new SqliteShotObservationRepository(database),
        commandBus,
        queryBus,
        eventBus,
        sessionRepository,
        competitionRepository: createMockCompetitionRepository(),
        applyShotProgress: vi.fn().mockResolvedValue(undefined),
        ipcRouter,
        userDataPath: '/tmp/test',
      });

      expect(queryBus.register).toHaveBeenCalledWith(GetSessionScoreToken, expect.any(Function));
    });

    it('should register GetShotHistory query handler', () => {
      sessionModule.register({
        shotObservationRepository: new SqliteShotObservationRepository(database),
        commandBus,
        queryBus,
        eventBus,
        sessionRepository,
        competitionRepository: createMockCompetitionRepository(),
        applyShotProgress: vi.fn().mockResolvedValue(undefined),
        ipcRouter,
        userDataPath: '/tmp/test',
      });

      expect(queryBus.register).toHaveBeenCalledWith(GetShotHistoryToken, expect.any(Function));
    });

    it('should register IPC handlers with sessionContract', () => {
      sessionModule.register({
        shotObservationRepository: new SqliteShotObservationRepository(database),
        commandBus,
        queryBus,
        eventBus,
        sessionRepository,
        competitionRepository: createMockCompetitionRepository(),
        applyShotProgress: vi.fn().mockResolvedValue(undefined),
        ipcRouter,
        userDataPath: '/tmp/test',
      });

      expect(ipcRouter.register).toHaveBeenCalledTimes(1);
      expect(ipcRouter.register).toHaveBeenCalledWith(sessionContract, expect.any(Object));
    });
  });
});
