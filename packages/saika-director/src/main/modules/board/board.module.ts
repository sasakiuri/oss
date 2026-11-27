import type { IpcMainInvokeEvent } from 'electron';

import { GetAllLanesToken } from '@/main/modules/lane-control';
import { defineModule } from '@/main/shared-infra/module/ModuleDefinition';
import { boardContract } from '@/shared/ipc/contracts';

import { GetEventByIdToken } from '@/main/modules/championship';

import { buildLiveRanking } from './application/buildLiveRanking';

export const boardModule = defineModule({
  name: 'board',
  deps: ['queryBus', 'ipcRouter', 'windowManager'],
  register(ctx) {
    const { queryBus, ipcRouter, windowManager } = ctx;

    // === IPC Registration ===
    ipcRouter.register(boardContract, {
      openTargetBoard: async (input) =>
        windowManager.createBoardWindow({
          type: 'target-board',
          laneRange: input.laneRange,
        }),
      openRankingBoard: async () =>
        windowManager.createBoardWindow({
          type: 'ranking-board',
        }),
      openResultsBoard: async (input) => {
        const eventResult = await queryBus.execute(GetEventByIdToken, { eventId: input.eventId });
        if (!eventResult) throw new Error(`Event not found: ${input.eventId}`);
        return windowManager.createBoardWindow({
          type: 'results-board',
          competitionId: input.competitionId,
          eventId: input.eventId,
          round: eventResult.round,
        });
      },
      openFinalBoard: async (input) =>
        windowManager.createBoardWindow({
          type: 'final-board',
          eventId: input.eventId,
        }),
      openScoreSheetPrint: async (input) =>
        windowManager.createBoardWindow({
          type: 'score-sheet-print',
          laneIds: input.laneIds,
          championshipName: input.championshipName,
          venue: input.venue,
          eventName: input.eventName,
          eventType: input.eventType,
        }),
      openResultsListPrint: async (input) => {
        const eventResult = await queryBus.execute(GetEventByIdToken, { eventId: input.eventId });
        if (!eventResult) throw new Error(`Event not found: ${input.eventId}`);
        return windowManager.createBoardWindow({
          type: 'results-list-print',
          eventId: input.eventId,
          eventName: input.eventName,
          relayNumber: input.relayNumber,
          round: eventResult.round,
          eventType: eventResult.eventType,
        });
      },
      openIncidentReportPrint: async (input) =>
        windowManager.createBoardWindow({
          type: 'incident-report-print',
          reportId: input.reportId,
        }),
      openProtestPrint: async (input) =>
        windowManager.createBoardWindow({
          type: 'protest-print',
          protestId: input.protestId,
        }),
      openEstBackupSourcePrint: async (input) =>
        windowManager.createBoardWindow({
          type: 'est-backup-source-print',
          sourceId: input.sourceId,
        }),
      closeBoard: (input) => {
        windowManager.closeBoardWindow(input);
        return Promise.resolve(undefined);
      },
      getConfig: (event?: unknown) => {
        const ipcEvent = event as IpcMainInvokeEvent;
        const windowId = windowManager.findWindowIdByWebContents(ipcEvent.sender);
        if (!windowId) return Promise.resolve(null);
        return Promise.resolve(windowManager.getWindowConfig(windowId));
      },
      getLiveRanking: async () => buildLiveRanking(await queryBus.execute(GetAllLanesToken, {})),
    });
  },
});
