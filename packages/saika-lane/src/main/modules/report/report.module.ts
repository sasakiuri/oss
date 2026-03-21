// SPDX-License-Identifier: MIT
/**
 * Report module definition
 *
 * Registers command/query handlers and IPC handlers related to report printing.
 */

import type { ModuleDefinition } from '@/main/composition/ModuleDefinition';
import { GetScoreSheetToken, OpenPrintWindowToken } from '@/main/composition/tokens';
import { reportContract } from '@/shared/ipc/contracts';
import type { InferHandlers } from '@/shared/ipc/defineContract';

import { createGetScoreSheetHandler } from './application/handlers/GetScoreSheetHandler';
import { createOpenPrintWindowHandler } from './application/handlers/OpenPrintWindowHandler';

type ReportDeps = 'queryBus' | 'commandBus' | 'ipcRouter' | 'sessionRepository' | 'storage' | 'printWindowService';

export const reportModule: ModuleDefinition<ReportDeps> = {
  name: 'report',
  deps: ['queryBus', 'commandBus', 'ipcRouter', 'sessionRepository', 'storage', 'printWindowService'] as const,
  register({ queryBus, commandBus, ipcRouter, sessionRepository, storage, printWindowService }) {
    queryBus.register(GetScoreSheetToken, createGetScoreSheetHandler(sessionRepository, storage));
    commandBus.register(OpenPrintWindowToken, createOpenPrintWindowHandler(printWindowService));

    const reportHandlers: InferHandlers<typeof reportContract> = {
      getScoreSheet: async (input) => {
        return await queryBus.execute(GetScoreSheetToken, {
          sessionId: input.sessionId,
        });
      },
      openPrintWindow: async (input) => {
        await commandBus.execute(OpenPrintWindowToken, {
          sessionId: input.sessionId,
        });
      },
    };

    ipcRouter.register(reportContract, reportHandlers);
  },
};
