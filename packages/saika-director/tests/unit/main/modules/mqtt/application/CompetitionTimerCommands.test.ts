// SPDX-License-Identifier: MIT
import type { CompetitionStatePayload } from '@sasakiuri/saika-protocol/CompetitionState';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CompetitionTimerCommands } from '@/main/modules/mqtt/application/CompetitionTimerCommands';
import { createDirectorCommandPort } from '@/main/modules/mqtt/application/DirectorCommandPort';
import type { CommandExecutionResult } from '@/main/modules/mqtt/application/DirectorMqttTypes';
import type { PublishCommandOptions } from '@/main/modules/mqtt/application/MqttCommandDispatcher';

const DIRECTOR_ID = 'director-1';
const COMPETITION_ID = '11111111-1111-4111-8111-111111111111';
const LANE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LANE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const NOW = new Date('2026-11-28T09:00:00.000Z');
const START_DELAY_MS = 3_000;

function competitionState(overrides: Partial<CompetitionStatePayload> = {}): CompetitionStatePayload {
  return {
    competitionId: COMPETITION_ID,
    competitionTypeId: 'AR60_FINAL',
    competitionTypeName: '10m Air Rifle Final',
    discipline: 'AIR_RIFLE_10M',
    roundName: 'Final',
    acc: 'DECIMAL',
    phase: 'MATCH',
    shotsPerSeries: 5,
    totalSeries: 16,
    totalShots: 24,
    laneIds: [LANE_A, LANE_B],
    startedAt: '2026-11-28T08:50:00.000Z',
    finishedAt: null,
    publishedAt: '2026-11-28T08:59:00.000Z',
    ...overrides,
  };
}

const SERIES_TIMER = {
  timerScope: 'SERIES' as const,
  timerStartAt: '2026-11-28T08:58:00.000Z',
  timerDurationSeconds: 250,
  stageIndex: 1,
  seriesIndex: 1,
};

function setup(initial: CompetitionStatePayload) {
  let current = initial;
  const published: PublishCommandOptions[] = [];
  // Like the dispatcher, a broker-accepted publish records its boundary before any Lane ACK arrives.
  let outcome: (options: PublishCommandOptions) => Promise<CommandExecutionResult> = async (options) => {
    options.onPublished?.();
    return {
      commandId: String(options.payload.commandId),
      action: options.action,
      success: true,
      lanes: options.expectedLaneIds.map((laneId) => ({ laneId, status: 'done' as const })),
    };
  };
  const commands = createDirectorCommandPort(DIRECTOR_ID, async (options) => {
    published.push(options);
    return outcome(options);
  });
  const competitions = {
    requireCompetition: vi.fn((competitionId: string) => {
      if (competitionId !== COMPETITION_ID) throw new Error(`Competition ${competitionId} not found`);
      return current;
    }),
    requireCompetitionPhase: vi.fn((competitionId: string, phase: string, operation: string) => {
      if (current.phase !== phase) {
        throw new Error(`Cannot ${operation} while competition ${competitionId} is in phase ${current.phase}`);
      }
      return current;
    }),
    requireCompetitionLane: vi.fn(),
    assertPhaseStartAllowed: vi.fn(),
    assertSafetyCleared: vi.fn(),
    assertTimedCommandReadiness: vi.fn(),
    updateCompetitionState: vi.fn((state: CompetitionStatePayload, changes: Partial<CompetitionStatePayload>) => ({
      ...state,
      ...changes,
    })),
    publishCompetitionState: vi.fn(async () => undefined),
    retainCompetitionState: vi.fn(async (state: CompetitionStatePayload, changes: Partial<CompetitionStatePayload>) => {
      current = { ...state, ...changes };
    }),
  };
  const context = {
    deadlines: { clear: vi.fn(), restore: vi.fn() },
    onFiringBoundary: vi.fn(),
  };
  const timers = new CompetitionTimerCommands(commands, competitions as never, context, START_DELAY_MS);
  return {
    timers,
    competitions,
    context,
    published,
    current: () => current,
    failWith: (next: typeof outcome) => {
      outcome = next;
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('CompetitionTimerCommands.stopActiveTimer', () => {
  it.each([
    ['a completed sighting', competitionState({ phase: 'SIGHTING_COMPLETE', activeTimer: SERIES_TIMER })],
    ['a MATCH without a running timer', competitionState({ phase: 'MATCH' })],
  ])('rejects stopping %s', async (_label, state) => {
    const { timers, context, published } = setup(state);

    await expect(timers.stopActiveTimer(COMPETITION_ID)).rejects.toThrow(
      `Competition ${COMPETITION_ID} has no active firing timer to stop`,
    );
    expect(context.deadlines.clear).not.toHaveBeenCalled();
    expect(published).toHaveLength(0);
  });

  it('broadcasts the expiry of the active timer, records the CLOSE boundary and clears the retained timer', async () => {
    const { timers, competitions, context, published, current } = setup(
      competitionState({ activeTimer: SERIES_TIMER }),
    );

    const result = await timers.stopActiveTimer(COMPETITION_ID);

    expect(result.success).toBe(true);
    expect(context.deadlines.clear).toHaveBeenCalledExactlyOnceWith(COMPETITION_ID);
    expect(published).toHaveLength(1);
    expect(published[0]).toMatchObject({
      action: 'timer-expired',
      topic: `saika/competition/${COMPETITION_ID}/command/timer-expired`,
      expectedLaneIds: [LANE_A, LANE_B],
      payload: {
        issuedBy: DIRECTOR_ID,
        timerScope: 'SERIES',
        stageIndex: 1,
        seriesIndex: 1,
        expiredAt: NOW.toISOString(),
      },
    });
    expect(context.onFiringBoundary).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        competitionId: COMPETITION_ID,
        phase: 'MATCH',
        transition: 'CLOSE',
        sourceAction: 'timer-expired',
        occurredAt: NOW,
      }),
    );
    expect(competitions.retainCompetitionState).toHaveBeenCalledOnce();
    expect(current().activeTimer).toBeUndefined();
    expect(context.deadlines.restore).not.toHaveBeenCalled();
  });

  it('restores the timer deadline when a Lane does not acknowledge the expiry', async () => {
    const state = competitionState({ phase: 'SIGHTING', activeTimer: { ...SERIES_TIMER, timerScope: 'STAGE' } });
    const { timers, competitions, context, failWith, current } = setup(state);
    failWith(async (options) => {
      options.onPublished?.();
      return {
        commandId: String(options.payload.commandId),
        action: options.action,
        success: false,
        lanes: [
          { laneId: LANE_A, status: 'done' },
          { laneId: LANE_B, status: 'timeout' },
        ],
      };
    });

    const result = await timers.stopActiveTimer(COMPETITION_ID);

    expect(result.success).toBe(false);
    expect(context.deadlines.clear).toHaveBeenCalledExactlyOnceWith(COMPETITION_ID);
    expect(context.deadlines.restore).toHaveBeenCalledExactlyOnceWith(state);
    expect(competitions.retainCompetitionState).not.toHaveBeenCalled();
    expect(current().activeTimer).toEqual(state.activeTimer);
    expect(context.onFiringBoundary).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ phase: 'SIGHTING', transition: 'CLOSE', sourceAction: 'timer-expired' }),
    );
  });

  it('restores the timer deadline and rethrows when the expiry cannot be published', async () => {
    const state = competitionState({ activeTimer: SERIES_TIMER });
    const { timers, competitions, context, failWith } = setup(state);
    failWith(async () => {
      throw new Error('broker offline');
    });

    await expect(timers.stopActiveTimer(COMPETITION_ID)).rejects.toThrow('broker offline');
    expect(context.deadlines.restore).toHaveBeenCalledExactlyOnceWith(state);
    expect(competitions.retainCompetitionState).not.toHaveBeenCalled();
    expect(context.onFiringBoundary).not.toHaveBeenCalled();
  });
});

describe('CompetitionTimerCommands.endSighting', () => {
  it('restores the sighting deadline and rethrows when the end command cannot be published', async () => {
    const state = competitionState({ phase: 'SIGHTING', activeTimer: { ...SERIES_TIMER, timerScope: 'STAGE' } });
    const { timers, competitions, context, failWith, current } = setup(state);
    failWith(async () => {
      throw new Error('publish rejected');
    });

    await expect(timers.endSighting(COMPETITION_ID)).rejects.toThrow('publish rejected');
    expect(context.deadlines.clear).toHaveBeenCalledExactlyOnceWith(COMPETITION_ID);
    expect(context.deadlines.restore).toHaveBeenCalledExactlyOnceWith(state);
    expect(competitions.retainCompetitionState).not.toHaveBeenCalled();
    expect(current().phase).toBe('SIGHTING');
  });
});

describe('CompetitionTimerCommands.advanceSeries', () => {
  it('rejects advancing outside MATCH', async () => {
    const { timers, published } = setup(competitionState({ phase: 'SIGHTING_COMPLETE' }));

    await expect(timers.advanceSeries(COMPETITION_ID, 1, 0)).rejects.toThrow(
      `Cannot advance series while competition ${COMPETITION_ID} is in phase SIGHTING_COMPLETE`,
    );
    expect(published).toHaveLength(0);
  });

  it('starts the next series timer after the configured start delay and retains it as active', async () => {
    const { timers, competitions, context, published, current } = setup(
      competitionState({ activeTimer: SERIES_TIMER }),
    );
    const timerStartAt = new Date(NOW.getTime() + START_DELAY_MS).toISOString();

    const result = await timers.advanceSeries(COMPETITION_ID, 1, 1, undefined, {
      durationSeconds: 50,
      stageIndex: 2,
      seriesIndex: 0,
    });

    expect(result.success).toBe(true);
    expect(competitions.assertSafetyCleared).toHaveBeenCalledExactlyOnceWith([LANE_A, LANE_B], 'advance series');
    expect(competitions.assertTimedCommandReadiness).toHaveBeenCalledExactlyOnceWith([LANE_A, LANE_B]);
    expect(published[0]).toMatchObject({
      action: 'advance-series',
      topic: `saika/competition/${COMPETITION_ID}/command/advance-series`,
      payload: { stageIndex: 1, fromSeriesIndex: 1, timerStartAt, timerDurationSeconds: 50 },
    });
    expect(published[0]?.payload).not.toHaveProperty('resumeOnly');
    expect(current().activeTimer).toEqual({
      timerScope: 'SERIES',
      timerStartAt,
      timerDurationSeconds: 50,
      stageIndex: 2,
      seriesIndex: 0,
    });
    expect(current().pendingTimer).toBeUndefined();
    expect(context.onFiringBoundary).not.toHaveBeenCalled();
  });

  it('resumes the current series without a timer and clears the retained timer', async () => {
    const { timers, competitions, published, current } = setup(competitionState({ activeTimer: SERIES_TIMER }));

    await timers.advanceSeries(COMPETITION_ID, 1, 0, true);

    expect(competitions.assertTimedCommandReadiness).not.toHaveBeenCalled();
    expect(published[0]?.payload).toMatchObject({ stageIndex: 1, fromSeriesIndex: 0, resumeOnly: true });
    expect(published[0]?.payload).not.toHaveProperty('timerStartAt');
    expect(published[0]?.payload).not.toHaveProperty('timerDurationSeconds');
    expect(current().activeTimer).toBeUndefined();
  });

  it('keeps the retained state when the series advance is not acknowledged by every Lane', async () => {
    const state = competitionState({ activeTimer: SERIES_TIMER });
    const { timers, competitions, failWith, current } = setup(state);
    failWith(async (options) => ({
      commandId: String(options.payload.commandId),
      action: options.action,
      success: false,
      lanes: [{ laneId: LANE_B, status: 'error', error: { code: 'REJECTED', message: 'series incomplete' } }],
    }));

    const result = await timers.advanceSeries(COMPETITION_ID, 1, 0, false, {
      durationSeconds: 250,
      stageIndex: 1,
      seriesIndex: 1,
    });

    expect(result.success).toBe(false);
    expect(competitions.retainCompetitionState).not.toHaveBeenCalled();
    expect(current()).toBe(state);
  });
});
