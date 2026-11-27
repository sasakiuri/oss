// SPDX-License-Identifier: MIT
import type { CompetitionStatePayload } from '@sasakiuri/saika-protocol/CompetitionState';
import { describe, expect, it, vi } from 'vitest';

import { CompetitionFinishCommands } from '@/main/modules/mqtt/application/CompetitionFinishCommands';
import type { CommandExecutionResult } from '@/main/modules/mqtt/application/DirectorMqttTypes';

const COMPETITION_ID = '11111111-1111-4111-8111-111111111111';
const LANE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LANE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function competitionState(overrides: Partial<CompetitionStatePayload> = {}): CompetitionStatePayload {
  return {
    competitionId: COMPETITION_ID,
    competitionTypeId: 'AR60',
    competitionTypeName: '10m Air Rifle 60 shots',
    discipline: 'AIR_RIFLE_10M',
    roundName: 'Qualification',
    acc: 'DECIMAL',
    phase: 'MATCH',
    shotsPerSeries: 10,
    totalSeries: 6,
    totalShots: 60,
    laneIds: [LANE_A, LANE_B],
    startedAt: '2026-11-28T08:00:00.000Z',
    finishedAt: null,
    publishedAt: '2026-11-28T09:00:00.000Z',
    ...overrides,
  };
}

function finishResult(success: boolean, lanes: CommandExecutionResult['lanes']): CommandExecutionResult {
  return { commandId: 'finish-command', action: 'finish-competition', success, lanes };
}

function setup(state: CompetitionStatePayload) {
  const published: CompetitionStatePayload[] = [];
  const competitions = {
    requireCompetition: vi.fn(() => state),
    updateCompetitionState: vi.fn((current: CompetitionStatePayload, changes: Partial<CompetitionStatePayload>) => ({
      ...current,
      ...changes,
    })),
    publishCompetitionState: vi.fn(async (next: CompetitionStatePayload) => {
      published.push(next);
    }),
    getCleanupLaneIds: vi.fn(() => [LANE_A, LANE_B]),
    clearRetainedState: vi.fn(async () => undefined),
  };
  const context = {
    callbacks: { assertCompetitionFinishAllowed: vi.fn() },
    deadlines: { clear: vi.fn(), restore: vi.fn() },
    snapshots: {
      captureCompetitionLaneSnapshotRevisions: vi.fn(() => new Map()),
      waitForFreshFinalLaneSnapshots: vi.fn(async () => new Map<string, string>()),
      getCompetitionResultLanes: vi.fn(() => []),
    },
    timers: {
      publishBroadcast: vi.fn(async () =>
        finishResult(true, [
          { laneId: LANE_A, status: 'done' },
          { laneId: LANE_B, status: 'done' },
        ]),
      ),
    },
    membership: {
      publishMembershipCommands: vi.fn(async () => ({
        success: true,
        commands: [] as CommandExecutionResult[],
      })),
    },
    onResult: vi.fn(),
  };
  const finish = new CompetitionFinishCommands(competitions, context as never);
  return { finish, competitions, context, published };
}

describe('CompetitionFinishCommands', () => {
  it('restores the timer deadlines and rethrows when the finish broadcast cannot be published', async () => {
    const state = competitionState();
    const { finish, competitions, context } = setup(state);
    context.timers.publishBroadcast.mockRejectedValueOnce(new Error('broker offline'));

    await expect(finish.finishCompetition(COMPETITION_ID)).rejects.toThrow('broker offline');

    expect(context.deadlines.clear).toHaveBeenCalledExactlyOnceWith(COMPETITION_ID);
    expect(context.deadlines.restore).toHaveBeenCalledExactlyOnceWith(state);
    expect(competitions.publishCompetitionState).not.toHaveBeenCalled();
    expect(context.onResult).not.toHaveBeenCalled();
  });

  it('keeps the MATCH running when a Lane does not acknowledge the finish', async () => {
    const state = competitionState();
    const { finish, competitions, context } = setup(state);
    const rejected = finishResult(false, [
      { laneId: LANE_A, status: 'done' },
      { laneId: LANE_B, status: 'timeout' },
    ]);
    context.timers.publishBroadcast.mockResolvedValueOnce(rejected);

    await expect(finish.finishCompetition(COMPETITION_ID)).resolves.toBe(rejected);

    expect(context.deadlines.restore).toHaveBeenCalledExactlyOnceWith(state);
    expect(competitions.publishCompetitionState).not.toHaveBeenCalled();
    expect(context.membership.publishMembershipCommands).not.toHaveBeenCalled();
    expect(competitions.clearRetainedState).not.toHaveBeenCalled();
  });

  it('keeps the completed competition retained when a Lane cannot leave it', async () => {
    const { finish, competitions, context, published } = setup(competitionState());
    const leaveLanes = [
      { laneId: LANE_A, status: 'done' as const },
      { laneId: LANE_B, status: 'error' as const, error: { code: 'LANE_BUSY', message: 'Lane is busy' } },
    ];
    context.membership.publishMembershipCommands.mockResolvedValueOnce({
      success: false,
      commands: [{ commandId: 'leave-command', action: 'leave-competition', success: false, lanes: leaveLanes }],
    });

    const result = await finish.finishCompetition(COMPETITION_ID);

    expect(result).toEqual({
      commandId: 'finish-command',
      action: 'finish-competition',
      success: false,
      lanes: leaveLanes,
    });
    expect(published).toHaveLength(1);
    expect(published[0]).toMatchObject({ phase: 'MATCH_COMPLETE', cleanupPreparedAt: expect.any(String) });
    expect(context.membership.publishMembershipCommands).toHaveBeenCalledExactlyOnceWith(
      COMPETITION_ID,
      [LANE_A, LANE_B],
      'leave-competition',
    );
    expect(competitions.clearRetainedState).not.toHaveBeenCalled();
    expect(context.onResult).toHaveBeenCalledExactlyOnceWith(result);
    expect(context.deadlines.restore).not.toHaveBeenCalled();
  });
});
