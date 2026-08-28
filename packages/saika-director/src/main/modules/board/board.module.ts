/**
 * board.module.ts
 *
 *
 */

import type { ModuleDefinition } from '@/main/shared-infra/module/ModuleDefinition';
import { defineQuery } from '@/main/shared-infra/cqrs/QueryBus';
import { boardContract } from '@/shared/ipc/contracts';
import type { IpcMainInvokeEvent } from 'electron';

import { type LaneControl, GetAllLanesToken } from '@/main/modules/lane-control';
import type { LiveRankingDto } from '@/shared/types/LiveRankingDto';
import { GetEventByIdToken } from '../championship/championship.module';

// Inline query token
const GetLiveRankingToken = defineQuery<unknown, { rankings: LiveRankingDto[] }>('GetLiveRanking');

function calculateAverage(lane: LaneControl): number {
  const shotCount = lane.matchShots.length;
  if (shotCount === 0) return 0;
  return Math.round((lane.totalScore / shotCount) * 100) / 100;
}

export const boardModule: ModuleDefinition<'queryBus' | 'ipcRouter' | 'windowManager'> = {
  name: 'board',
  deps: ['queryBus', 'ipcRouter', 'windowManager'] as const,
  register(ctx) {
    const { queryBus, ipcRouter, windowManager } = ctx;

    // === Inline GetLiveRanking query handler on QueryBus ===
    queryBus.register(GetLiveRankingToken, async () => {
      const lanes = (await queryBus.execute(GetAllLanesToken, {})) as LaneControl[];

      const lanesWithPlayers = lanes.filter((lane) => lane.player !== null);

      const rankingData = lanesWithPlayers.map((lane) => ({
        lane,
        average: calculateAverage(lane),
        totalScore: lane.totalScore,
        firstShotTime: lane.lastShotTime,
      }));

      rankingData.sort((a, b) => {
        if (a.average !== b.average) return b.average - a.average;
        if (a.totalScore !== b.totalScore) return b.totalScore - a.totalScore;
        if (a.firstShotTime === null && b.firstShotTime === null) return 0;
        if (a.firstShotTime === null) return 1;
        if (b.firstShotTime === null) return -1;
        return a.firstShotTime - b.firstShotTime;
      });

      const rankings: LiveRankingDto[] = rankingData.map((data, index) => {
        const lane = data.lane;
        return {
          rank: index + 1,
          laneId: lane.id,
          channel: lane.channel.value,
          playerName: lane.player?.name ?? '',
          affiliation: lane.player?.affiliation ?? '',
          seriesScores: lane.seriesScores,
          totalScore: lane.totalScore,
          average: data.average,
          shotCount: lane.matchShots.length,
          phase: lane.phase,
        };
      });

      return { rankings };
    });

    // === IPC Registration ===
    ipcRouter.register(boardContract, {
      openTargetBoard: async (input) =>
        windowManager.createBoardWindow('target-board', {
          type: 'target-board',
          laneRange: input.laneRange,
        }),
      openRankingBoard: async () =>
        windowManager.createBoardWindow('ranking-board', {
          type: 'ranking-board',
        }),
      openResultsBoard: async (input) => {
        const eventResult = await queryBus.execute(GetEventByIdToken, { eventId: input.eventId });
        if (!eventResult) throw new Error(`Event not found: ${input.eventId}`);
        return windowManager.createBoardWindow('results-board', {
          type: 'results-board',
          competitionId: input.competitionId,
          eventId: input.eventId,
          round: eventResult.round,
        });
      },
      openFinalBoard: async (input) =>
        windowManager.createBoardWindow('final-board', {
          type: 'final-board',
          eventId: input.eventId,
        }),
      openScoreSheetPrint: async (input) =>
        windowManager.createBoardWindow('score-sheet-print', {
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
        return windowManager.createBoardWindow('results-list-print', {
          type: 'results-list-print',
          eventId: input.eventId,
          eventName: input.eventName,
          relayNumber: input.relayNumber,
          round: eventResult.round,
          eventType: eventResult.eventType,
        });
      },
      openIncidentReportPrint: async (input) =>
        windowManager.createBoardWindow('incident-report-print', {
          type: 'incident-report-print',
          reportId: input.reportId,
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
      getLiveRanking: async () => {
        const result = await queryBus.execute(GetLiveRankingToken, {});
        return result.rankings;
      },
    });
  },
};
