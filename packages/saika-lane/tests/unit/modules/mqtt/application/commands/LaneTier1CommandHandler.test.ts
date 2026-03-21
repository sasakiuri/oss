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

import type { BroadcastCommandHandler } from '@/main/modules/mqtt/application/commands/BroadcastCommandHandler';
import { LaneTier1CommandHandler } from '@/main/modules/mqtt/application/commands/LaneTier1CommandHandler';
import type { PerLaneCommandHandler } from '@/main/modules/mqtt/application/commands/PerLaneCommandHandler';
import type { CompetitionStateSubscriber } from '@/main/modules/mqtt/application/CompetitionStateSubscriber';
import type { RpcRequestHandler } from '@/main/modules/mqtt/application/RpcRequestHandler';
import { CommandIdempotencyGuard } from '@/main/modules/mqtt/infra/CommandIdempotencyGuard';
import type { IMqttClientService } from '@/main/modules/mqtt/infra/IMqttClientService';

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

function createMockBroadcastHandler(): BroadcastCommandHandler {
  return {
    subscribeToCompetition: vi.fn().mockResolvedValue(undefined),
    unsubscribeFromCompetition: vi.fn().mockResolvedValue(undefined),
  } as unknown as BroadcastCommandHandler;
}

function createMockPerLaneHandler(): PerLaneCommandHandler {
  return {
    subscribeToCompetition: vi.fn().mockResolvedValue(undefined),
    unsubscribeFromCompetition: vi.fn().mockResolvedValue(undefined),
  } as unknown as PerLaneCommandHandler;
}

function createMockRpcHandler(): RpcRequestHandler {
  return {
    subscribe: vi.fn().mockResolvedValue(undefined),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
  } as unknown as RpcRequestHandler;
}

function createMockCompetitionStateSubscriber(): CompetitionStateSubscriber {
  return {
    subscribe: vi.fn().mockResolvedValue(undefined),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
  } as unknown as CompetitionStateSubscriber;
}

const LANE_ID = 'a1111111-1111-4111-a111-111111111111';
const COMPETITION_ID = 'b2222222-2222-4222-a222-222222222222';

function buildCommand(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    commandId: 'c3333333-3333-4333-a333-333333333333',
    issuedBy: 'director',
    issuedAt: new Date().toISOString(),
    ...overrides,
  };
}

const flushPromises = () => new Promise<void>((resolve) => setTimeout(resolve, 50));

describe('LaneTier1CommandHandler', () => {
  let mqttClient: IMqttClientService;
  let guard: CommandIdempotencyGuard;
  let broadcastHandler: BroadcastCommandHandler;
  let perLaneHandler: PerLaneCommandHandler;
  let rpcHandler: RpcRequestHandler;
  let competitionStateSubscriber: CompetitionStateSubscriber;
  let handler: LaneTier1CommandHandler;
  let messageHandler: (topic: string, payload: Buffer) => void;

  beforeEach(() => {
    mqttClient = createMockMqttClient();
    guard = new CommandIdempotencyGuard();
    broadcastHandler = createMockBroadcastHandler();
    perLaneHandler = createMockPerLaneHandler();
    rpcHandler = createMockRpcHandler();
    competitionStateSubscriber = createMockCompetitionStateSubscriber();
    handler = new LaneTier1CommandHandler(
      mqttClient,
      guard,
      broadcastHandler,
      perLaneHandler,
      rpcHandler,
      competitionStateSubscriber,
      () => LANE_ID,
    );

    (mqttClient.onMessage as ReturnType<typeof vi.fn>).mockImplementation(
      (h: (topic: string, payload: Buffer) => void) => {
        messageHandler = h;
        return () => {
          /* unsubscribe */
        };
      },
    );
  });

  async function sendMessage(action: string, payload: Record<string, unknown>): Promise<void> {
    await handler.subscribe();
    const topic = `saika/lane/${LANE_ID}/command/${action}`;
    messageHandler(topic, Buffer.from(JSON.stringify(payload)));
    await flushPromises();
  }

  it('subscribes to tier1 command topic', async () => {
    await handler.subscribe();

    expect(mqttClient.subscribe).toHaveBeenCalledWith(`saika/lane/${LANE_ID}/command/+`, 1);
  });

  it('unsubscribes from tier1 command topic', async () => {
    await handler.subscribe();
    await handler.unsubscribe();

    expect(mqttClient.unsubscribe).toHaveBeenCalledWith(`saika/lane/${LANE_ID}/command/+`);
  });

  describe('join-competition', () => {
    it('subscribes to competition topics and child handlers', async () => {
      const cmd = buildCommand({ competitionId: COMPETITION_ID });

      await sendMessage('join-competition', cmd);

      expect(mqttClient.subscribe).toHaveBeenCalledWith(`saika/competition/${COMPETITION_ID}/#`, 1);
      expect(broadcastHandler.subscribeToCompetition).toHaveBeenCalledWith(COMPETITION_ID);
      expect(perLaneHandler.subscribeToCompetition).toHaveBeenCalledWith(COMPETITION_ID);
      expect(rpcHandler.subscribe).toHaveBeenCalledWith(COMPETITION_ID);
      expect(competitionStateSubscriber.subscribe).toHaveBeenCalledWith(COMPETITION_ID);
    });

    it('sets competitionId after joining', async () => {
      expect(handler.competitionId).toBeNull();

      await sendMessage('join-competition', buildCommand({ competitionId: COMPETITION_ID }));

      expect(handler.competitionId).toBe(COMPETITION_ID);
    });

    it('sends done ACK on success', async () => {
      await sendMessage('join-competition', buildCommand({ competitionId: COMPETITION_ID }));

      const publishCalls = (mqttClient.publish as ReturnType<typeof vi.fn>).mock.calls;
      const ackCalls = publishCalls.filter((call: unknown[]) => (call[0] as string).includes('/acknowledgement'));

      expect(ackCalls.length).toBe(2);
      const doneAck = JSON.parse(ackCalls[1]![1] as string);
      expect(doneAck.status).toBe('done');
    });
  });

  describe('ALREADY_IN_COMPETITION error', () => {
    it('returns error ACK when already in competition', async () => {
      // First join
      await sendMessage('join-competition', buildCommand({ competitionId: COMPETITION_ID }));

      (mqttClient.publish as ReturnType<typeof vi.fn>).mockClear();

      // Second join attempt
      const topic = `saika/lane/${LANE_ID}/command/join-competition`;
      const cmd2 = buildCommand({
        commandId: 'd4444444-4444-4444-a444-444444444444',
        competitionId: 'f6666666-6666-4666-a666-666666666666',
      });
      messageHandler(topic, Buffer.from(JSON.stringify(cmd2)));
      await flushPromises();

      const publishCalls = (mqttClient.publish as ReturnType<typeof vi.fn>).mock.calls;
      const ackCalls = publishCalls.filter((call: unknown[]) => (call[0] as string).includes('/acknowledgement'));

      expect(ackCalls.length).toBe(2);
      const errorAck = JSON.parse(ackCalls[1]![1] as string);
      expect(errorAck.status).toBe('error');
      expect(errorAck.error.code).toBe('MQTT_ALREADY_IN_COMPETITION');
    });
  });

  describe('leave-competition', () => {
    it('unsubscribes from competition topics and child handlers', async () => {
      // Join first
      await sendMessage('join-competition', buildCommand({ competitionId: COMPETITION_ID }));

      (mqttClient.publish as ReturnType<typeof vi.fn>).mockClear();

      // Leave
      const topic = `saika/lane/${LANE_ID}/command/leave-competition`;
      const leaveCmd = buildCommand({
        commandId: 'd4444444-4444-4444-a444-444444444444',
        competitionId: COMPETITION_ID,
      });
      messageHandler(topic, Buffer.from(JSON.stringify(leaveCmd)));
      await flushPromises();

      expect(broadcastHandler.unsubscribeFromCompetition).toHaveBeenCalled();
      expect(perLaneHandler.unsubscribeFromCompetition).toHaveBeenCalled();
      expect(rpcHandler.unsubscribe).toHaveBeenCalled();
      expect(competitionStateSubscriber.unsubscribe).toHaveBeenCalled();
      expect(handler.competitionId).toBeNull();
    });

    it('sends error ACK when not in competition', async () => {
      await sendMessage('leave-competition', buildCommand({ competitionId: COMPETITION_ID }));

      const publishCalls = (mqttClient.publish as ReturnType<typeof vi.fn>).mock.calls;
      const ackCalls = publishCalls.filter((call: unknown[]) => (call[0] as string).includes('/acknowledgement'));

      expect(ackCalls.length).toBe(2);
      const errorAck = JSON.parse(ackCalls[1]![1] as string);
      expect(errorAck.status).toBe('error');
      expect(errorAck.error.code).toBe('MQTT_NOT_IN_COMPETITION');
    });
  });

  describe('join after leave', () => {
    it('allows joining after leaving', async () => {
      // Join
      await sendMessage('join-competition', buildCommand({ competitionId: COMPETITION_ID }));

      // Leave
      const leaveTopic = `saika/lane/${LANE_ID}/command/leave-competition`;
      const leaveCmd = buildCommand({
        commandId: 'd4444444-4444-4444-a444-444444444444',
        competitionId: COMPETITION_ID,
      });
      messageHandler(leaveTopic, Buffer.from(JSON.stringify(leaveCmd)));
      await flushPromises();
      expect(handler.competitionId).toBeNull();

      // Join again
      (mqttClient.publish as ReturnType<typeof vi.fn>).mockClear();
      const joinTopic = `saika/lane/${LANE_ID}/command/join-competition`;
      const joinCmd = buildCommand({
        commandId: 'e5555555-5555-4555-a555-555555555555',
        competitionId: COMPETITION_ID,
      });
      messageHandler(joinTopic, Buffer.from(JSON.stringify(joinCmd)));
      await flushPromises();

      expect(handler.competitionId).toBe(COMPETITION_ID);

      const publishCalls = (mqttClient.publish as ReturnType<typeof vi.fn>).mock.calls;
      const ackCalls = publishCalls.filter((call: unknown[]) => (call[0] as string).includes('/acknowledgement'));
      const doneAck = JSON.parse(ackCalls[1]![1] as string);
      expect(doneAck.status).toBe('done');
    });
  });

  describe('ACK topic format', () => {
    it('uses correct tier1 ACK topic', async () => {
      await sendMessage('join-competition', buildCommand({ competitionId: COMPETITION_ID }));

      const expectedAckTopic = `saika/lane/${LANE_ID}/command/join-competition/acknowledgement`;
      const publishCalls = (mqttClient.publish as ReturnType<typeof vi.fn>).mock.calls;
      expect(publishCalls[0]![0]).toBe(expectedAckTopic);
    });
  });
});
