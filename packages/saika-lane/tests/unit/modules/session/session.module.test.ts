// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/test-userData' },
}));

import {
  GetSessionScoreToken,
  GetShotHistoryToken,
  RecordShotToken,
  ResetSessionToken,
  StartSessionToken,
  SwitchModeToken,
} from '@/main/composition/tokens';
import { sessionModule } from '@/main/modules/session/session.module';
import { sessionContract } from '@/shared/ipc/contracts';

import {
  createMockCommandBus,
  createMockEventBus,
  createMockIpcRouter,
  createMockQueryBus,
  createMockSessionRepository,
} from '../../../helpers/mockDependencies';

describe('session.module', () => {
  let commandBus: ReturnType<typeof createMockCommandBus>;
  let queryBus: ReturnType<typeof createMockQueryBus>;
  let eventBus: ReturnType<typeof createMockEventBus>;
  let ipcRouter: ReturnType<typeof createMockIpcRouter>;
  let sessionRepository: ReturnType<typeof createMockSessionRepository>;

  beforeEach(() => {
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
        'ipcRouter',
        'userDataPath',
      ]);
    });
  });

  describe('register', () => {
    it('should register 4 command handlers', () => {
      sessionModule.register({
        commandBus,
        queryBus,
        eventBus,
        sessionRepository,
        ipcRouter,
        userDataPath: '/tmp/test',
      });

      expect(commandBus.register).toHaveBeenCalledTimes(4);
    });

    it('should register StartSession command handler', () => {
      sessionModule.register({
        commandBus,
        queryBus,
        eventBus,
        sessionRepository,
        ipcRouter,
        userDataPath: '/tmp/test',
      });

      expect(commandBus.register).toHaveBeenCalledWith(StartSessionToken, expect.any(Function));
    });

    it('should register RecordShot command handler', () => {
      sessionModule.register({
        commandBus,
        queryBus,
        eventBus,
        sessionRepository,
        ipcRouter,
        userDataPath: '/tmp/test',
      });

      expect(commandBus.register).toHaveBeenCalledWith(RecordShotToken, expect.any(Function));
    });

    it('should register SwitchMode command handler', () => {
      sessionModule.register({
        commandBus,
        queryBus,
        eventBus,
        sessionRepository,
        ipcRouter,
        userDataPath: '/tmp/test',
      });

      expect(commandBus.register).toHaveBeenCalledWith(SwitchModeToken, expect.any(Function));
    });

    it('should register ResetSession command handler', () => {
      sessionModule.register({
        commandBus,
        queryBus,
        eventBus,
        sessionRepository,
        ipcRouter,
        userDataPath: '/tmp/test',
      });

      expect(commandBus.register).toHaveBeenCalledWith(ResetSessionToken, expect.any(Function));
    });

    it('should register 2 query handlers', () => {
      sessionModule.register({
        commandBus,
        queryBus,
        eventBus,
        sessionRepository,
        ipcRouter,
        userDataPath: '/tmp/test',
      });

      expect(queryBus.register).toHaveBeenCalledTimes(2);
    });

    it('should register GetSessionScore query handler', () => {
      sessionModule.register({
        commandBus,
        queryBus,
        eventBus,
        sessionRepository,
        ipcRouter,
        userDataPath: '/tmp/test',
      });

      expect(queryBus.register).toHaveBeenCalledWith(GetSessionScoreToken, expect.any(Function));
    });

    it('should register GetShotHistory query handler', () => {
      sessionModule.register({
        commandBus,
        queryBus,
        eventBus,
        sessionRepository,
        ipcRouter,
        userDataPath: '/tmp/test',
      });

      expect(queryBus.register).toHaveBeenCalledWith(GetShotHistoryToken, expect.any(Function));
    });

    it('should register IPC handlers with sessionContract', () => {
      sessionModule.register({
        commandBus,
        queryBus,
        eventBus,
        sessionRepository,
        ipcRouter,
        userDataPath: '/tmp/test',
      });

      expect(ipcRouter.register).toHaveBeenCalledTimes(1);
      expect(ipcRouter.register).toHaveBeenCalledWith(sessionContract, expect.any(Object));
    });
  });
});
