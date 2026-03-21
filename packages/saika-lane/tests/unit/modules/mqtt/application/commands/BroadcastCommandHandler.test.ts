// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/main/shared-infra/logging/createLogger', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('@/shared/errors/ErrorCatalog', () => ({
  ErrorCatalog: {
    createError: (code: string, metadata?: Record<string, unknown>) => {
      const err = new Error(metadata?.detail ? `${code}: ${metadata.detail}` : code);
      (err as unknown as { code: string }).code = code;
      return err;
    },
  },
}));

import type { LaneTimerService } from '@/main/modules/competition/infra/LaneTimerService';
import { BroadcastCommandHandler } from '@/main/modules/mqtt/application/commands/BroadcastCommandHandler';
import { CommandIdempotencyGuard } from '@/main/modules/mqtt/infra/CommandIdempotencyGuard';
import type { IMqttClientService } from '@/main/modules/mqtt/infra/IMqttClientService';

import { createMockCommandBus } from '../../../../../helpers/mockDependencies';

function createMockMqttClient(): IMqttClientService {
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    publish: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockResolvedValue(undefined),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
    setWill: vi.fn(),
    onMessage: vi.fn().mockReturnValue(() => {}),
    onConnect: vi.fn(),
    onDisconnect: vi.fn(),
    isConnected: vi.fn().mockReturnValue(true),
  };
}

function createMockTimerService(): LaneTimerService {
  return {
    start: vi.fn(),
    startAt: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
    processTick: vi.fn(),
  } as unknown as LaneTimerService;
}

// Valid UUIDs (version 4 format)
const LANE_ID = 'a1111111-1111-4111-a111-111111111111';
const COMPETITION_ID = 'b2222222-2222-4222-a222-222222222222';
const COMMAND_ID = 'c3333333-3333-4333-a333-333333333333';

function buildCommand(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    commandId: COMMAND_ID,
    issuedBy: 'director',
    issuedAt: new Date().toISOString(),
    ...overrides,
  };
}

const flushPromises = () => new Promise<void>((resolve) => setTimeout(resolve, 50));

describe('BroadcastCommandHandler', () => {
  let mqttClient: IMqttClientService;
  let commandBus: ReturnType<typeof createMockCommandBus>;
  let timerService: LaneTimerService;
  let guard: CommandIdempotencyGuard;
  let handler: BroadcastCommandHandler;
  let messageHandler: (topic: string, payload: Buffer) => void;

  beforeEach(() => {
    mqttClient = createMockMqttClient();
    commandBus = createMockCommandBus();
    timerService = createMockTimerService();
    guard = new CommandIdempotencyGuard();
    handler = new BroadcastCommandHandler(mqttClient, commandBus, timerService, guard, () => LANE_ID, COMPETITION_ID);

    (mqttClient.onMessage as ReturnType<typeof vi.fn>).mockImplementation(
      (h: (topic: string, payload: Buffer) => void) => {
        messageHandler = h;
        return () => {
          /* unsubscribe */
        };
      },
    );

    (commandBus.execute as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  });

  async function sendMessage(action: string, payload: Record<string, unknown>): Promise<void> {
    await handler.subscribeToCompetition(COMPETITION_ID);
    const topic = `saika/competition/${COMPETITION_ID}/command/${action}`;
    messageHandler(topic, Buffer.from(JSON.stringify(payload)));
    await flushPromises();
  }

  it('subscribes to competition broadcast topic', async () => {
    await handler.subscribeToCompetition(COMPETITION_ID);

    expect(mqttClient.subscribe).toHaveBeenCalledWith(`saika/competition/${COMPETITION_ID}/command/+`, 1);
  });

  it('unsubscribes from competition broadcast topic', async () => {
    await handler.subscribeToCompetition(COMPETITION_ID);
    await handler.unsubscribeFromCompetition();

    expect(mqttClient.unsubscribe).toHaveBeenCalledWith(`saika/competition/${COMPETITION_ID}/command/+`);
  });

  describe('start-sighting', () => {
    it('executes StartPreparation + timer startAt', async () => {
      const now = new Date().toISOString();
      const cmd = buildCommand({
        timerStartAt: now,
        timerDurationSeconds: 900,
      });

      await sendMessage('start-sighting', cmd);

      expect(commandBus.execute).toHaveBeenCalled();
      expect(timerService.startAt).toHaveBeenCalledWith(COMPETITION_ID, now, 900);
    });

    it('skips when targetLaneIds does not include our laneId', async () => {
      const cmd = buildCommand({
        timerStartAt: new Date().toISOString(),
        timerDurationSeconds: 900,
        targetLaneIds: ['d4444444-4444-4444-a444-444444444444'],
      });

      await sendMessage('start-sighting', cmd);

      expect(commandBus.execute).not.toHaveBeenCalled();
    });

    it('proceeds when targetLaneIds includes our laneId', async () => {
      const cmd = buildCommand({
        timerStartAt: new Date().toISOString(),
        timerDurationSeconds: 900,
        targetLaneIds: [LANE_ID],
      });

      await sendMessage('start-sighting', cmd);

      expect(commandBus.execute).toHaveBeenCalled();
    });
  });

  describe('end-sighting', () => {
    it('executes EndPreparation', async () => {
      await sendMessage('end-sighting', buildCommand());

      expect(commandBus.execute).toHaveBeenCalled();
    });
  });

  describe('start-match', () => {
    it('executes StartMatch + timer startAt', async () => {
      const now = new Date().toISOString();
      const cmd = buildCommand({
        timerStartAt: now,
        timerDurationSeconds: 3600,
      });

      await sendMessage('start-match', cmd);

      expect(commandBus.execute).toHaveBeenCalled();
      expect(timerService.startAt).toHaveBeenCalledWith(COMPETITION_ID, now, 3600);
    });
  });

  describe('advance-series', () => {
    it('executes AdvanceStage', async () => {
      const cmd = buildCommand({ stageIndex: 0, fromSeriesIndex: 0 });

      await sendMessage('advance-series', cmd);

      expect(commandBus.execute).toHaveBeenCalled();
    });
  });

  describe('finish-competition', () => {
    it('executes FinishCompetition', async () => {
      await sendMessage('finish-competition', buildCommand());

      expect(commandBus.execute).toHaveBeenCalled();
    });
  });

  describe('timer-started', () => {
    it('calls timerService.startAt', async () => {
      const now = new Date().toISOString();
      const cmd = buildCommand({
        timerScope: 'STAGE',
        timerStartAt: now,
        timerDurationSeconds: 600,
        stageIndex: 0,
        seriesIndex: null,
      });

      await sendMessage('timer-started', cmd);

      expect(timerService.startAt).toHaveBeenCalledWith(COMPETITION_ID, now, 600);
    });
  });

  describe('timer-expired', () => {
    it('calls timerService.stop', async () => {
      const cmd = buildCommand({
        timerScope: 'STAGE',
        stageIndex: 0,
        seriesIndex: null,
        expiredAt: new Date().toISOString(),
      });

      await sendMessage('timer-expired', cmd);

      expect(timerService.stop).toHaveBeenCalled();
    });
  });

  describe('idempotency', () => {
    it('skips duplicate commandId', async () => {
      const cmd = buildCommand();

      await handler.subscribeToCompetition(COMPETITION_ID);
      const topic = `saika/competition/${COMPETITION_ID}/command/end-sighting`;

      messageHandler(topic, Buffer.from(JSON.stringify(cmd)));
      await flushPromises();
      expect(commandBus.execute).toHaveBeenCalledTimes(1);

      messageHandler(topic, Buffer.from(JSON.stringify(cmd)));
      await flushPromises();
      expect(commandBus.execute).toHaveBeenCalledTimes(1);
    });
  });

  describe('2-phase ACK', () => {
    it('sends executing then done ACK on success', async () => {
      await sendMessage('end-sighting', buildCommand());

      const publishCalls = (mqttClient.publish as ReturnType<typeof vi.fn>).mock.calls;
      const ackCalls = publishCalls.filter((call: unknown[]) => (call[0] as string).includes('/acknowledgement/'));

      expect(ackCalls.length).toBe(2);

      const executingAck = JSON.parse(ackCalls[0]![1] as string);
      expect(executingAck.status).toBe('executing');

      const doneAck = JSON.parse(ackCalls[1]![1] as string);
      expect(doneAck.status).toBe('done');
    });

    it('sends executing then error ACK on failure', async () => {
      (commandBus.execute as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('command failed'));

      await sendMessage('end-sighting', buildCommand());

      const publishCalls = (mqttClient.publish as ReturnType<typeof vi.fn>).mock.calls;
      const ackCalls = publishCalls.filter((call: unknown[]) => (call[0] as string).includes('/acknowledgement/'));

      expect(ackCalls.length).toBe(2);
      const errorAck = JSON.parse(ackCalls[1]![1] as string);
      expect(errorAck.status).toBe('error');
      expect(errorAck.error).toBeDefined();
    });
  });

  describe('unknown action', () => {
    it('sends error ACK for unknown action', async () => {
      await sendMessage('unknown-action', buildCommand());

      const publishCalls = (mqttClient.publish as ReturnType<typeof vi.fn>).mock.calls;
      const ackCall = publishCalls.find((call: unknown[]) => (call[0] as string).includes('/acknowledgement/'));
      const ackPayload = JSON.parse(ackCall![1] as string);
      expect(ackPayload.status).toBe('error');
      expect(ackPayload.error.code).toBe('MQTT_UNKNOWN_COMMAND_ACTION');
    });
  });

  describe('validation failure', () => {
    it('sends error ACK for invalid payload', async () => {
      const cmd = { commandId: 'not-a-uuid', issuedBy: 'test', issuedAt: 'invalid-date' };

      await sendMessage('start-sighting', cmd);

      const publishCalls = (mqttClient.publish as ReturnType<typeof vi.fn>).mock.calls;
      const ackCall = publishCalls.find((call: unknown[]) => (call[0] as string).includes('/acknowledgement/'));
      const ackPayload = JSON.parse(ackCall![1] as string);
      expect(ackPayload.status).toBe('error');
      expect(ackPayload.error.code).toBe('MQTT_COMMAND_VALIDATION_FAILED');
    });
  });

  describe('clock drift detection', () => {
    const fakeFlush = async () => {
      vi.advanceTimersByTime(50);
      await vi.runAllTimersAsync();
    };

    it('adds warning to done ACK when drift > 5s', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-02-24T10:00:10.000Z'));

      const cmd = buildCommand({
        timerStartAt: '2026-02-24T10:00:00.000Z',
        timerDurationSeconds: 900,
      });

      await handler.subscribeToCompetition(COMPETITION_ID);
      const topic = `saika/competition/${COMPETITION_ID}/command/start-sighting`;
      messageHandler(topic, Buffer.from(JSON.stringify(cmd)));
      await fakeFlush();

      const publishCalls = (mqttClient.publish as ReturnType<typeof vi.fn>).mock.calls;
      const ackCalls = publishCalls.filter((call: unknown[]) => (call[0] as string).includes('/acknowledgement/'));

      expect(ackCalls.length).toBe(2);
      const doneAck = JSON.parse(ackCalls[1]![1] as string);
      expect(doneAck.status).toBe('done');
      expect(doneAck.warning).toBe('clock_drift_detected');

      vi.useRealTimers();
    });

    it('rejects command when drift > 30s', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-02-24T10:01:00.000Z'));

      const cmd = buildCommand({
        commandId: 'd4444444-4444-4444-a444-444444444444',
        timerStartAt: '2026-02-24T10:00:00.000Z',
        timerDurationSeconds: 900,
      });

      await handler.subscribeToCompetition(COMPETITION_ID);
      const topic = `saika/competition/${COMPETITION_ID}/command/start-match`;
      messageHandler(topic, Buffer.from(JSON.stringify(cmd)));
      await fakeFlush();

      const publishCalls = (mqttClient.publish as ReturnType<typeof vi.fn>).mock.calls;
      const ackCalls = publishCalls.filter((call: unknown[]) => (call[0] as string).includes('/acknowledgement/'));

      // Should only have error ACK, no executing ACK
      expect(ackCalls.length).toBe(1);
      const errorAck = JSON.parse(ackCalls[0]![1] as string);
      expect(errorAck.status).toBe('error');
      expect(errorAck.error.code).toBe('MQTT_CLOCK_OUT_OF_SYNC');

      // commandBus should NOT have been called
      expect(commandBus.execute).not.toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('no warning when drift < 5s', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-02-24T10:00:02.000Z'));

      const cmd = buildCommand({
        commandId: 'e5555555-5555-4555-a555-555555555555',
        timerStartAt: '2026-02-24T10:00:00.000Z',
        timerDurationSeconds: 900,
      });

      await handler.subscribeToCompetition(COMPETITION_ID);
      const topic = `saika/competition/${COMPETITION_ID}/command/start-sighting`;
      messageHandler(topic, Buffer.from(JSON.stringify(cmd)));
      await fakeFlush();

      const publishCalls = (mqttClient.publish as ReturnType<typeof vi.fn>).mock.calls;
      const ackCalls = publishCalls.filter((call: unknown[]) => (call[0] as string).includes('/acknowledgement/'));

      expect(ackCalls.length).toBe(2);
      const doneAck = JSON.parse(ackCalls[1]![1] as string);
      expect(doneAck.status).toBe('done');
      expect(doneAck.warning).toBeUndefined();

      vi.useRealTimers();
    });

    it('does not check drift for non-timer actions', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-02-24T10:05:00.000Z'));

      const cmd = buildCommand({
        commandId: 'f6666666-6666-4666-a666-666666666666',
      });

      await handler.subscribeToCompetition(COMPETITION_ID);
      const topic = `saika/competition/${COMPETITION_ID}/command/end-sighting`;
      messageHandler(topic, Buffer.from(JSON.stringify(cmd)));
      await fakeFlush();

      const publishCalls = (mqttClient.publish as ReturnType<typeof vi.fn>).mock.calls;
      const ackCalls = publishCalls.filter((call: unknown[]) => (call[0] as string).includes('/acknowledgement/'));

      expect(ackCalls.length).toBe(2);
      const doneAck = JSON.parse(ackCalls[1]![1] as string);
      expect(doneAck.status).toBe('done');

      vi.useRealTimers();
    });
  });
});
