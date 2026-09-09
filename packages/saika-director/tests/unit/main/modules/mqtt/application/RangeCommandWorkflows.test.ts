// SPDX-License-Identifier: MIT
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CommandExecutionResult } from '@/main/modules/mqtt/application/DirectorMqttTypes';
import type { PublishCommandOptions } from '@/main/modules/mqtt/application/MqttCommandDispatcher';
import { RangeInterruptionCommands } from '@/main/modules/mqtt/application/RangeInterruptionCommands';
import { RangeSafetyCommands } from '@/main/modules/mqtt/application/RangeSafetyCommands';

const COMPETITION_ID = '11111111-1111-4111-8111-111111111111';
const LANE_1 = '22222222-2222-4222-8222-222222222222';
const LANE_2 = '33333333-3333-4333-8333-333333333333';
const INTERRUPTION_ID = '44444444-4444-4444-8444-444444444444';

function createPorts() {
  const commands = {
    commandBase: vi.fn((fields: Record<string, unknown>) => ({
      commandId: crypto.randomUUID(),
      issuerId: 'director',
      issuedBy: 'CRO',
      issuedAt: new Date().toISOString(),
      ...fields,
    })),
    publishCommand: vi.fn(async (options: PublishCommandOptions): Promise<CommandExecutionResult> => ({
      commandId: options.payload.commandId,
      action: options.action,
      success: true,
      lanes: options.expectedLaneIds.map((laneId) => ({ laneId, status: 'done' })),
    })),
  };
  const context = {
    requireCompetition: vi.fn().mockReturnValue({ competitionId: COMPETITION_ID, phase: 'MATCH' }),
    requireCompetitionLane: vi.fn((_competitionId: string, laneId: string) => {
      if (![LANE_1, LANE_2].includes(laneId)) throw new Error('Lane is not joined');
    }),
    assertSafetyCleared: vi.fn(),
    assertTimedCommandReadiness: vi.fn(),
    hasLane: (laneId: string) => [LANE_1, LANE_2].includes(laneId),
    onResult: vi.fn(),
    log: vi.fn(),
  };
  return { commands, context };
}

afterEach(() => vi.useRealTimers());

describe('Range interruption commands', () => {
  it('checks all clocks before sending and keeps one restart time across a deduplicated batch', async () => {
    vi.useFakeTimers();
    const now = Date.parse('2026-09-10T00:00:00Z');
    vi.setSystemTime(now);
    const { commands, context } = createPorts();
    const workflow = new RangeInterruptionCommands(commands, context, 3000);
    context.assertTimedCommandReadiness.mockImplementationOnce(() => {
      throw new Error('Lane clock is not ready');
    });
    await expect(
      workflow.resumeRangeTimers(COMPETITION_ID, [LANE_1, LANE_2], INTERRUPTION_ID, 120, true),
    ).rejects.toThrow('Lane clock is not ready');
    expect(commands.publishCommand).not.toHaveBeenCalled();

    commands.publishCommand.mockImplementation(async (options) => {
      // Sending to the first Lane must not shift the second Lane's scheduled restart.
      vi.setSystemTime(Date.now() + 1000);
      return { commandId: options.payload.commandId, action: options.action, success: true, lanes: [] };
    });
    await expect(
      workflow.resumeRangeTimers(COMPETITION_ID, [LANE_1, LANE_2, LANE_1], INTERRUPTION_ID, 120, true),
    ).resolves.toMatchObject({ success: true });
    expect(context.assertTimedCommandReadiness).toHaveBeenLastCalledWith([LANE_1, LANE_2]);
    expect(commands.publishCommand).toHaveBeenCalledTimes(2);
    for (const [options] of commands.publishCommand.mock.calls) {
      expect(options.payload).toMatchObject({
        timerStartAt: '2026-09-10T00:00:03.000Z',
        authorizedRemainingSeconds: 120,
        unlimitedSightingShots: true,
      });
      expect(options.acknowledgementTopic(options.expectedLaneIds[0]!)).toBe(`${options.topic}/acknowledgement`);
    }
  });

  it('reports a stopped Lane as a partial failure while preserving the other Lane outcome', async () => {
    const { commands, context } = createPorts();
    context.assertSafetyCleared.mockImplementation((lanes: string[]) => {
      if (lanes.includes(LANE_2)) throw new Error('Safety STOP is active');
    });
    const workflow = new RangeInterruptionCommands(commands, context, 0);
    const result = await workflow.resumeRangeMatch(COMPETITION_ID, [LANE_1, LANE_2], INTERRUPTION_ID);
    expect(result).toMatchObject({
      success: false,
      commands: [
        { success: true, lanes: [{ laneId: LANE_1, status: 'done' }] },
        {
          success: false,
          lanes: [
            {
              laneId: LANE_2,
              status: 'error',
              error: { code: 'RANGE_COMMAND_FAILED', message: 'Safety STOP is active' },
            },
          ],
        },
      ],
    });
    expect(commands.publishCommand).toHaveBeenCalledOnce();
    expect(context.onResult).toHaveBeenCalledWith(result.commands[1]);
  });

  it('validates every Lane before issuing any pause command', async () => {
    const { commands, context } = createPorts();
    const workflow = new RangeInterruptionCommands(commands, context, 0);
    await expect(workflow.pauseRangeTimers(COMPETITION_ID, [LANE_1, 'unknown'], INTERRUPTION_ID)).rejects.toThrow(
      'Lane is not joined',
    );
    expect(commands.publishCommand).not.toHaveBeenCalled();
  });
});

describe('Range safety commands', () => {
  it('reports publish failure per Lane and continues to publish the other STOP commands', async () => {
    const { commands, context } = createPorts();
    commands.publishCommand.mockRejectedValueOnce(new Error('Unavailable Lane'));
    const workflow = new RangeSafetyCommands(commands, context);
    const result = await workflow.activateSafetyStop(
      [LANE_1, LANE_2, LANE_1],
      INTERRUPTION_ID,
      'Range inspection',
      'CRO',
    );
    expect(result).toMatchObject({
      success: false,
      commands: [
        {
          success: false,
          lanes: [
            { laneId: LANE_1, status: 'error', error: { code: 'SAFETY_COMMAND_FAILED', message: 'Unavailable Lane' } },
          ],
        },
        { success: true, lanes: [{ laneId: LANE_2, status: 'done' }] },
      ],
    });
    expect(commands.publishCommand).toHaveBeenCalledTimes(2);
    expect(context.onResult).toHaveBeenCalledWith(result.commands[0]);
  });

  it('rejects unknown Lanes before publishing clear commands and preserves explicit confirmation', async () => {
    const { commands, context } = createPorts();
    const workflow = new RangeSafetyCommands(commands, context);
    await expect(
      workflow.clearSafetyStop([LANE_1, 'unknown'], INTERRUPTION_ID, 'Range checked', 'CRO'),
    ).rejects.toThrow('Unknown Lane');
    expect(commands.publishCommand).not.toHaveBeenCalled();
    await workflow.clearSafetyStop([LANE_1], INTERRUPTION_ID, 'Range checked', 'CRO');
    const options = commands.publishCommand.mock.calls[0]![0];
    expect(options.payload).toMatchObject({
      safetyStopId: INTERRUPTION_ID,
      clearanceReason: 'Range checked',
      confirmedSafe: true,
      issuedBy: 'CRO',
    });
    expect(options.topic).toBe(`saika/lane/${LANE_1}/command/clear-safety-stop`);
  });
});
