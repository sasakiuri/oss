// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GetScoreSheetToken, OpenPrintWindowToken } from '@/main/composition/tokens';
import { reportModule } from '@/main/modules/report/report.module';
import { reportContract } from '@/shared/ipc/contracts';

import {
  createMockCommandBus,
  createMockIpcRouter,
  createMockPrintWindowService,
  createMockQueryBus,
  createMockSessionRepository,
  createMockStorage,
} from '../../../helpers/mockDependencies';

describe('report.module', () => {
  let commandBus: ReturnType<typeof createMockCommandBus>;
  let queryBus: ReturnType<typeof createMockQueryBus>;
  let ipcRouter: ReturnType<typeof createMockIpcRouter>;
  let sessionRepository: ReturnType<typeof createMockSessionRepository>;
  let storage: ReturnType<typeof createMockStorage>;
  let printWindowService: ReturnType<typeof createMockPrintWindowService>;

  beforeEach(() => {
    commandBus = createMockCommandBus();
    queryBus = createMockQueryBus();
    ipcRouter = createMockIpcRouter();
    sessionRepository = createMockSessionRepository();
    storage = createMockStorage();
    printWindowService = createMockPrintWindowService();
  });

  describe('metadata', () => {
    it('should have name "report"', () => {
      expect(reportModule.name).toBe('report');
    });

    it('should declare correct dependencies', () => {
      expect(reportModule.deps).toEqual([
        'queryBus',
        'commandBus',
        'ipcRouter',
        'sessionRepository',
        'storage',
        'printWindowService',
      ]);
    });
  });

  describe('register', () => {
    function registerModule() {
      reportModule.register({
        queryBus,
        commandBus,
        ipcRouter,
        sessionRepository,
        storage,
        printWindowService,
      });
    }

    it('should register 1 query handler (GetScoreSheet)', () => {
      registerModule();

      expect(queryBus.register).toHaveBeenCalledTimes(1);
      expect(queryBus.register).toHaveBeenCalledWith(GetScoreSheetToken, expect.any(Function));
    });

    it('should register 1 command handler (OpenPrintWindow)', () => {
      registerModule();

      expect(commandBus.register).toHaveBeenCalledTimes(1);
      expect(commandBus.register).toHaveBeenCalledWith(OpenPrintWindowToken, expect.any(Function));
    });

    it('should register IPC handlers with reportContract', () => {
      registerModule();

      expect(ipcRouter.register).toHaveBeenCalledTimes(1);
      expect(ipcRouter.register).toHaveBeenCalledWith(reportContract, expect.any(Object));
    });

    it('should register handlers with getScoreSheet and openPrintWindow methods', () => {
      registerModule();

      const registeredHandlers = (ipcRouter.register as ReturnType<typeof vi.fn>).mock.calls[0]![1];
      expect(registeredHandlers).toHaveProperty('getScoreSheet');
      expect(registeredHandlers).toHaveProperty('openPrintWindow');
    });
  });
});
