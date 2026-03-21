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

import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import { PerLaneCommandHandler } from '@/main/modules/mqtt/application/commands/PerLaneCommandHandler';
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

const LANE_ID = 'a1111111-1111-4111-a111-111111111111';
const COMPETITION_ID = 'b2222222-2222-4222-a222-222222222222';
const SESSION_ID = 'd4444444-4444-4444-a444-444444444444';

function createMockCompetitionRepo(): ICompetitionRepository {
  return {
    save: vi.fn().mockResolvedValue(undefined),
    findById: vi.fn().mockResolvedValue({ sessionId: SESSION_ID }),
    findBySessionId: vi.fn().mockResolvedValue(null),
    findActive: vi.fn().mockResolvedValue(null),
    delete: vi.fn().mockResolvedValue(undefined),
  };
}

function buildCommand(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    commandId: 'c3333333-3333-4333-a333-333333333333',
    issuedBy: 'director',
    issuedAt: new Date().toISOString(),
    ...overrides,
  };
}

const flushPromises = () => new Promise<void>((resolve) => setTimeout(resolve, 50));

describe('PerLaneCommandHandler', () => {
  let mqttClient: IMqttClientService;
  let commandBus: ReturnType<typeof createMockCommandBus>;
  let guard: CommandIdempotencyGuard;
  let competitionRepo: ICompetitionRepository;
  let handler: PerLaneCommandHandler;
  let messageHandler: (topic: string, payload: Buffer) => void;

  beforeEach(() => {
    mqttClient = createMockMqttClient();
    commandBus = createMockCommandBus();
    guard = new CommandIdempotencyGuard();
    competitionRepo = createMockCompetitionRepo();
    handler = new PerLaneCommandHandler(mqttClient, commandBus, guard, competitionRepo, () => LANE_ID, COMPETITION_ID);

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
    const topic = `saika/competition/${COMPETITION_ID}/lane/${LANE_ID}/command/${action}`;
    messageHandler(topic, Buffer.from(JSON.stringify(payload)));
    await flushPromises();
  }

  it('subscribes to per-lane command topic', async () => {
    await handler.subscribeToCompetition(COMPETITION_ID);

    expect(mqttClient.subscribe).toHaveBeenCalledWith(
      `saika/competition/${COMPETITION_ID}/lane/${LANE_ID}/command/+`,
      1,
    );
  });

  it('unsubscribes from per-lane command topic', async () => {
    await handler.subscribeToCompetition(COMPETITION_ID);
    await handler.unsubscribeFromCompetition();

    expect(mqttClient.unsubscribe).toHaveBeenCalledWith(
      `saika/competition/${COMPETITION_ID}/lane/${LANE_ID}/command/+`,
    );
  });

  describe('assign-athlete', () => {
    it('executes AssignAthlete command', async () => {
      const cmd = buildCommand({
        athlete: { startNumber: 1, id: 'athlete-1', name: 'Test Athlete' },
      });

      await sendMessage('assign-athlete', cmd);

      expect(commandBus.execute).toHaveBeenCalled();
    });

    it('executes AssignAthlete with null athlete (unassign)', async () => {
      const cmd = buildCommand({ athlete: null });

      await sendMessage('assign-athlete', cmd);

      expect(commandBus.execute).toHaveBeenCalled();
    });
  });

  describe('reset-session', () => {
    it('executes ResetSession command with correct sessionId from competition', async () => {
      const cmd = buildCommand({ reason: 'Device malfunction' });

      await sendMessage('reset-session', cmd);

      expect(competitionRepo.findById).toHaveBeenCalledWith(COMPETITION_ID);
      expect(commandBus.execute).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ sessionId: SESSION_ID }),
      );
    });

    it('sends error ACK when competition not found', async () => {
      vi.mocked(competitionRepo.findById).mockResolvedValue(null);
      const cmd = buildCommand({ reason: 'Device malfunction' });

      await sendMessage('reset-session', cmd);

      const publishCalls = (mqttClient.publish as ReturnType<typeof vi.fn>).mock.calls;
      const ackCalls = publishCalls.filter((call: unknown[]) => (call[0] as string).includes('/acknowledgement'));

      // executing ACK + error ACK
      expect(ackCalls.length).toBe(2);
      const errorAck = JSON.parse(ackCalls[1]![1] as string);
      expect(errorAck.status).toBe('error');
      expect(errorAck.error.code).toBe('COMPETITION_NOT_FOUND');
    });
  });

  describe('2-phase ACK', () => {
    it('sends executing then done ACK on success', async () => {
      const cmd = buildCommand({ athlete: null });

      await sendMessage('assign-athlete', cmd);

      const publishCalls = (mqttClient.publish as ReturnType<typeof vi.fn>).mock.calls;
      const ackCalls = publishCalls.filter((call: unknown[]) => (call[0] as string).includes('/acknowledgement'));

      expect(ackCalls.length).toBe(2);

      const executingAck = JSON.parse(ackCalls[0]![1] as string);
      expect(executingAck.status).toBe('executing');

      const doneAck = JSON.parse(ackCalls[1]![1] as string);
      expect(doneAck.status).toBe('done');
    });

    it('sends error ACK on failure', async () => {
      (commandBus.execute as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('failed'));
      const cmd = buildCommand({ athlete: null });

      await sendMessage('assign-athlete', cmd);

      const publishCalls = (mqttClient.publish as ReturnType<typeof vi.fn>).mock.calls;
      const ackCalls = publishCalls.filter((call: unknown[]) => (call[0] as string).includes('/acknowledgement'));

      expect(ackCalls.length).toBe(2);
      const errorAck = JSON.parse(ackCalls[1]![1] as string);
      expect(errorAck.status).toBe('error');
    });
  });

  describe('ACK topic format', () => {
    it('uses correct per-lane ACK topic', async () => {
      const cmd = buildCommand({ athlete: null });

      await sendMessage('assign-athlete', cmd);

      const expectedAckTopic = `saika/competition/${COMPETITION_ID}/lane/${LANE_ID}/command/assign-athlete/acknowledgement`;
      const publishCalls = (mqttClient.publish as ReturnType<typeof vi.fn>).mock.calls;
      expect(publishCalls[0]![0]).toBe(expectedAckTopic);
    });
  });

  describe('unknown action', () => {
    it('sends error ACK for unknown action', async () => {
      await sendMessage('unknown', buildCommand());

      const publishCalls = (mqttClient.publish as ReturnType<typeof vi.fn>).mock.calls;
      const ackPayload = JSON.parse(publishCalls[0]![1] as string);
      expect(ackPayload.status).toBe('error');
      expect(ackPayload.error.code).toBe('MQTT_UNKNOWN_COMMAND_ACTION');
    });
  });
});
