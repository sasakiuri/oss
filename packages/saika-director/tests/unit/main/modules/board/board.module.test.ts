import { describe, expect, it, vi } from 'vitest';

import { boardModule } from '@/main/modules/board/board.module';
import { GetEventByIdToken } from '@/main/modules/championship/championship.module';
import { GetAllLanesToken } from '@/main/modules/lane-control';
import { Channel } from '@/main/modules/lane-control/domain/Channel';
import { LaneControl } from '@/main/modules/lane-control/domain/LaneControl';
import { QueryBus } from '@/main/shared-infra/cqrs/QueryBus';
import { boardContract } from '@/shared/ipc/contracts';
import type { InferHandlers } from '@/shared/ipc/defineContract';

import { QUALIFICATION_CONFIG } from '../../../../helpers/testConfigs';

function harness(lanes: LaneControl[] = []) {
  const queryBus = new QueryBus();
  queryBus.register(GetAllLanesToken, async () => lanes);
  const windowManager = {
    createBoardWindow: vi.fn(async () => 'board-window'),
    closeBoardWindow: vi.fn(),
    findWindowIdByWebContents: vi.fn<() => string | undefined>(() => 'board-window'),
    getWindowConfig: vi.fn(() => ({ type: 'ranking-board' })),
  };
  let handlers!: InferHandlers<typeof boardContract>;
  boardModule.register({
    queryBus,
    windowManager: windowManager as never,
    ipcRouter: {
      register: vi.fn((contract, registeredHandlers) => {
        expect(contract).toBe(boardContract);
        handlers = registeredHandlers;
      }),
    } as never,
  });
  return { handlers, queryBus, windowManager };
}

describe('board module', () => {
  it('opens target and print windows with the selected content, then closes the requested window', async () => {
    const { handlers, windowManager } = harness();
    const laneRange = { from: 2, to: 5 };
    await expect(handlers.openTargetBoard({ laneRange })).resolves.toBe('board-window');
    expect(windowManager.createBoardWindow).toHaveBeenLastCalledWith('target-board', {
      type: 'target-board',
      laneRange,
    });
    await handlers.openRankingBoard();
    expect(windowManager.createBoardWindow).toHaveBeenLastCalledWith('ranking-board', { type: 'ranking-board' });
    await handlers.openFinalBoard({ eventId: 'event-1' });
    expect(windowManager.createBoardWindow).toHaveBeenLastCalledWith('final-board', {
      type: 'final-board',
      eventId: 'event-1',
    });
    const scoreSheet = {
      laneIds: ['lane-2', 'lane-5'],
      championshipName: 'Autumn championship',
      venue: 'Main range',
      eventName: 'Air rifle',
      eventType: 'AR60',
    };
    await handlers.openScoreSheetPrint(scoreSheet);
    expect(windowManager.createBoardWindow).toHaveBeenLastCalledWith('score-sheet-print', {
      type: 'score-sheet-print',
      ...scoreSheet,
    });
    await handlers.openIncidentReportPrint({ reportId: 'report-1' });
    expect(windowManager.createBoardWindow).toHaveBeenLastCalledWith('incident-report-print', {
      type: 'incident-report-print',
      reportId: 'report-1',
    });
    await handlers.openProtestPrint({ protestId: 'protest-1' });
    expect(windowManager.createBoardWindow).toHaveBeenLastCalledWith('protest-print', {
      type: 'protest-print',
      protestId: 'protest-1',
    });
    await handlers.openEstBackupSourcePrint({ sourceId: 'source-1' });
    expect(windowManager.createBoardWindow).toHaveBeenLastCalledWith('est-backup-source-print', {
      type: 'est-backup-source-print',
      sourceId: 'source-1',
    });
    await handlers.closeBoard('board-window');
    expect(windowManager.closeBoardWindow).toHaveBeenCalledWith('board-window');
  });

  it('uses the saved event round and type when opening results displays and printouts', async () => {
    const { handlers, queryBus, windowManager } = harness();
    const findEvent = vi.fn(async ({ eventId }: { eventId: string }) => ({
      id: eventId,
      name: 'Final',
      eventType: 'AR60_FINAL',
      round: 'Final',
      sortOrder: 0,
      rulePackIdentity: null,
    }));
    queryBus.register(GetEventByIdToken, findEvent);

    await handlers.openResultsBoard({ competitionId: 'competition-1', eventId: 'event-1' });
    expect(windowManager.createBoardWindow).toHaveBeenLastCalledWith('results-board', {
      type: 'results-board',
      competitionId: 'competition-1',
      eventId: 'event-1',
      round: 'Final',
    });
    await handlers.openResultsListPrint({ eventId: 'event-1', eventName: 'Final results', relayNumber: 2 });
    expect(windowManager.createBoardWindow).toHaveBeenLastCalledWith('results-list-print', {
      type: 'results-list-print',
      eventId: 'event-1',
      eventName: 'Final results',
      relayNumber: 2,
      round: 'Final',
      eventType: 'AR60_FINAL',
    });
    expect(findEvent).toHaveBeenCalledWith({ eventId: 'event-1' });
  });

  it('rejects a missing event before creating either results window', async () => {
    const { handlers, queryBus, windowManager } = harness();
    queryBus.register(GetEventByIdToken, async () => null);
    await expect(handlers.openResultsBoard({ competitionId: 'competition-1', eventId: 'missing' })).rejects.toThrow(
      'Event not found: missing',
    );
    await expect(handlers.openResultsListPrint({ eventId: 'missing' })).rejects.toThrow('Event not found: missing');
    expect(windowManager.createBoardWindow).not.toHaveBeenCalled();
  });

  it('returns only the configuration associated with the requesting web contents', async () => {
    const { handlers, windowManager } = harness();
    const sender = { id: 42 };
    await expect(handlers.getConfig({ sender })).resolves.toEqual({ type: 'ranking-board' });
    expect(windowManager.findWindowIdByWebContents).toHaveBeenCalledWith(sender);
    expect(windowManager.getWindowConfig).toHaveBeenCalledWith('board-window');

    windowManager.findWindowIdByWebContents.mockReturnValue(undefined);
    windowManager.getWindowConfig.mockClear();
    await expect(handlers.getConfig({ sender: { id: 99 } })).resolves.toBeNull();
    expect(windowManager.getWindowConfig).not.toHaveBeenCalled();
  });

  it('omits unassigned lanes and reports finite averages before the first shot', async () => {
    const assigned = LaneControl.create('lane-1', Channel.create(1), QUALIFICATION_CONFIG).toSnapshot();
    const { handlers } = harness([
      LaneControl.create('lane-2', Channel.create(2), QUALIFICATION_CONFIG),
      LaneControl.fromSnapshot({ ...assigned, player: { name: 'Athlete', affiliation: 'Team' } }),
    ]);
    await expect(handlers.getLiveRanking()).resolves.toEqual([
      {
        rank: 1,
        laneId: 'lane-1',
        channel: 1,
        playerName: 'Athlete',
        affiliation: 'Team',
        seriesScores: [0, 0, 0, 0, 0, 0],
        totalScore: 0,
        average: 0,
        shotCount: 0,
        phase: 'IDLE',
      },
    ]);
  });

  it('ranks live progress by average and reports the underlying total and shot count', async () => {
    const lane = (channel: number, scores: number[]) => {
      const snapshot = LaneControl.create(
        `lane-${channel}`,
        Channel.create(channel),
        QUALIFICATION_CONFIG,
      ).toSnapshot();
      return LaneControl.fromSnapshot({
        ...snapshot,
        player: { name: `Athlete ${channel}`, affiliation: 'Team' },
        matchShots: scores.map((score, index) => ({ shotNumber: index + 1, score, seriesNumber: 1 })),
      });
    };
    const { handlers } = harness([lane(1, [9, 9]), lane(2, [10.5]), lane(3, [10, 10, 10.1])]);
    await expect(handlers.getLiveRanking()).resolves.toMatchObject([
      { rank: 1, laneId: 'lane-2', totalScore: 10.5, average: 10.5, shotCount: 1 },
      { rank: 2, laneId: 'lane-3', totalScore: 30.1, average: 10.03, shotCount: 3 },
      { rank: 3, laneId: 'lane-1', totalScore: 18, average: 9, shotCount: 2 },
    ]);
  });
});
