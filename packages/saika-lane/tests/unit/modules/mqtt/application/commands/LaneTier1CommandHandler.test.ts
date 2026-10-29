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

import type { ICompetitionShootOffControl } from '@/main/modules/competition-shoot-off';
import type { BroadcastCommandHandler } from '@/main/modules/mqtt/application/commands/BroadcastCommandHandler';
import { CommandIdempotencyGuard } from '@/main/modules/mqtt/application/commands/CommandIdempotencyGuard';
import { LaneTier1CommandHandler } from '@/main/modules/mqtt/application/commands/LaneTier1CommandHandler';
import type { PerLaneCommandHandler } from '@/main/modules/mqtt/application/commands/PerLaneCommandHandler';
import type { CompetitionStateSubscriber } from '@/main/modules/mqtt/application/CompetitionStateSubscriber';
import { DirectorMembership } from '@/main/modules/mqtt/application/DirectorMembership';
import type { LaneSafetyStatePublisher } from '@/main/modules/mqtt/application/LaneSafetyStatePublisher';
import type { RetainPublisher } from '@/main/modules/mqtt/application/RetainPublisher';
import type { RpcRequestHandler } from '@/main/modules/mqtt/application/RpcRequestHandler';
import type { IMqttClientService } from '@/main/modules/mqtt/domain/IMqttClientService';
import { LaneSafetyStopState, type ILaneSafetyStopControl } from '@/main/modules/safety-stop';
import type { ITimedTargetControl } from '@/main/modules/timed-target';
import { TypedEventBus } from '@/main/shared-infra/events/TypedEventBus';

import { createMockStorage } from '../../../../../helpers/mockDependencies';

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
  let retainPublisher: RetainPublisher;
  let storage: ReturnType<typeof createMockStorage>;
  let shootOffControl: ICompetitionShootOffControl;
  let safetyStopControl: ILaneSafetyStopControl;
  let safetyStatePublisher: LaneSafetyStatePublisher;
  let timedTargetControl: ITimedTargetControl;
  let membership: DirectorMembership;
  let eventBus: TypedEventBus;
  let onChange: ReturnType<typeof vi.fn<(event: unknown) => void>>;
  let handler: LaneTier1CommandHandler;
  let messageHandler: (topic: string, payload: Buffer) => void;

  beforeEach(() => {
    mqttClient = createMockMqttClient();
    guard = new CommandIdempotencyGuard();
    broadcastHandler = createMockBroadcastHandler();
    perLaneHandler = createMockPerLaneHandler();
    rpcHandler = createMockRpcHandler();
    competitionStateSubscriber = createMockCompetitionStateSubscriber();
    retainPublisher = {
      clearCompetitionTopics: vi.fn().mockResolvedValue(undefined),
    } as unknown as RetainPublisher;
    storage = createMockStorage();
    shootOffControl = {
      open: vi.fn(),
      close: vi.fn(),
      getState: vi.fn().mockReturnValue(null),
      canAcceptShot: vi.fn().mockReturnValue(false),
      recordShot: vi.fn(),
    } as unknown as ICompetitionShootOffControl;
    const stoppedState = LaneSafetyStopState.create({
      safetyStopId: 'd4444444-4444-4444-a444-444444444444',
      status: 'STOPPED',
      reason: 'Unsafe condition',
      stoppedBy: 'director',
      stoppedAt: new Date('2026-09-02T00:00:00.000Z'),
    });
    safetyStopControl = {
      activate: vi.fn().mockResolvedValue(stoppedState),
      clear: vi.fn().mockResolvedValue(stoppedState),
      getState: vi.fn().mockReturnValue(stoppedState),
      isStopped: vi.fn().mockReturnValue(true),
    };
    safetyStatePublisher = {
      publishCurrentState: vi.fn().mockResolvedValue(undefined),
    } as unknown as LaneSafetyStatePublisher;
    timedTargetControl = {
      enforcementMode: 'REQUIRED',
      start: vi.fn(),
      cancel: vi.fn(),
      getState: vi.fn().mockReturnValue(null),
      tryAcceptShot: vi.fn(),
      restore: vi.fn(),
      dispose: vi.fn(),
    } as unknown as ITimedTargetControl;
    eventBus = new TypedEventBus();
    onChange = vi.fn();
    eventBus.on('DirectorMembershipChanged', onChange);
    membership = new DirectorMembership(storage, eventBus);
    handler = new LaneTier1CommandHandler(
      mqttClient,
      guard,
      broadcastHandler,
      perLaneHandler,
      rpcHandler,
      competitionStateSubscriber,
      retainPublisher,
      membership,
      () => LANE_ID,
      safetyStopControl,
      safetyStatePublisher,
      undefined,
      shootOffControl,
      undefined,
      timedTargetControl,
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

      expect(mqttClient.subscribe).not.toHaveBeenCalledWith(`saika/competition/${COMPETITION_ID}/#`, 1);
      expect(broadcastHandler.subscribeToCompetition).toHaveBeenCalledWith(COMPETITION_ID);
      expect(perLaneHandler.subscribeToCompetition).toHaveBeenCalledWith(COMPETITION_ID);
      expect(rpcHandler.subscribe).toHaveBeenCalledWith(COMPETITION_ID);
      expect(competitionStateSubscriber.subscribe).toHaveBeenCalledWith(COMPETITION_ID);
      expect(storage.set).toHaveBeenCalledWith('mqtt.competitionId', COMPETITION_ID);
    });

    it('sets competitionId after joining', async () => {
      expect(handler.competitionId).toBeNull();

      await sendMessage('join-competition', buildCommand({ competitionId: COMPETITION_ID }));

      expect(handler.competitionId).toBe(COMPETITION_ID);
      expect(onChange).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ competitionId: COMPETITION_ID, revision: 1 }),
      );
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

  describe('probe-clock', () => {
    it('returns receive and send timestamps without requiring competition membership', async () => {
      const directorSentAt = '2026-09-01T00:00:00.000Z';
      await sendMessage('probe-clock', buildCommand({ directorSentAt }));

      const acknowledgements = vi
        .mocked(mqttClient.publish)
        .mock.calls.filter((call) => call[0].includes('/acknowledgement'));
      const done = JSON.parse(acknowledgements[1]![1]);
      expect(done).toMatchObject({
        status: 'done',
        data: { directorSentAt },
      });
      expect(Date.parse(done.data.laneReceivedAt)).not.toBeNaN();
      expect(Date.parse(done.data.laneSentAt)).not.toBeNaN();
      expect(handler.competitionId).toBeNull();
    });
  });

  describe('activate-safety-stop', () => {
    it('closes an active shoot-off window so clearing STOP cannot resume it', async () => {
      vi.mocked(shootOffControl.getState).mockReturnValue({
        competitionId: COMPETITION_ID,
        runId: 'e5555555-5555-4555-a555-555555555555',
        iteration: 3,
        timerStartAt: '2026-09-02T00:00:00.000Z',
        timerDurationSeconds: 50,
        shotsPerLane: 1,
        status: 'OPEN',
        recordedShotIds: [],
      });
      vi.mocked(timedTargetControl.getState).mockReturnValue({
        sequenceId: 'f6666666-6666-4666-a666-666666666666',
        competitionId: COMPETITION_ID,
        purpose: 'SHOOT_OFF',
        phase: 'ARMED',
      } as ReturnType<ITimedTargetControl['getState']>);

      await sendMessage(
        'activate-safety-stop',
        buildCommand({
          safetyStopId: 'd4444444-4444-4444-a444-444444444444',
          reason: 'Unsafe condition',
        }),
      );

      expect(safetyStopControl.activate).toHaveBeenCalled();
      expect(shootOffControl.close).toHaveBeenCalledWith(COMPETITION_ID, 'e5555555-5555-4555-a555-555555555555', 3);
      expect(timedTargetControl.cancel).toHaveBeenCalledWith({
        sequenceId: 'f6666666-6666-4666-a666-666666666666',
        reason: 'Safety stop activated: Unsafe condition',
      });
      expect(safetyStatePublisher.publishCurrentState).toHaveBeenCalled();
      const acknowledgements = vi
        .mocked(mqttClient.publish)
        .mock.calls.filter((call) => call[0].includes('/acknowledgement'));
      expect(JSON.parse(acknowledgements[1]![1])).toMatchObject({
        status: 'done',
        data: { status: 'STOPPED', timerRestarted: false },
      });
    });
  });

  describe('ALREADY_IN_COMPETITION error', () => {
    it('acknowledges a retry for the competition it has already joined', async () => {
      await sendMessage('join-competition', buildCommand({ competitionId: COMPETITION_ID }));
      (mqttClient.publish as ReturnType<typeof vi.fn>).mockClear();

      const topic = `saika/lane/${LANE_ID}/command/join-competition`;
      const retry = buildCommand({
        commandId: 'd4444444-4444-4444-a444-444444444444',
        competitionId: COMPETITION_ID,
      });
      messageHandler(topic, Buffer.from(JSON.stringify(retry)));
      await flushPromises();

      const acknowledgements = (mqttClient.publish as ReturnType<typeof vi.fn>).mock.calls.filter((call: unknown[]) =>
        (call[0] as string).includes('/acknowledgement'),
      );
      expect(JSON.parse(acknowledgements[1]![1] as string)).toMatchObject({
        commandId: retry.commandId,
        status: 'done',
      });
      expect(broadcastHandler.subscribeToCompetition).toHaveBeenCalledTimes(1);
    });

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
      vi.mocked(shootOffControl.getState).mockReturnValue({
        competitionId: COMPETITION_ID,
        runId: 'e5555555-5555-4555-a555-555555555555',
        iteration: 2,
        timerStartAt: new Date().toISOString(),
        timerDurationSeconds: 50,
        shotsPerLane: 1,
        status: 'COMPLETE',
        recordedShotIds: ['f6666666-6666-4666-a666-666666666666'],
      });

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
      expect(retainPublisher.clearCompetitionTopics).toHaveBeenCalledWith(COMPETITION_ID, LANE_ID);
      expect(shootOffControl.close).toHaveBeenCalledWith(COMPETITION_ID, 'e5555555-5555-4555-a555-555555555555', 2);
      expect(storage.delete).toHaveBeenCalledWith('mqtt.competitionId');
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

  describe('join rollback', () => {
    it('does not enter the competition when a child subscription fails', async () => {
      vi.mocked(perLaneHandler.subscribeToCompetition).mockRejectedValue(new Error('subscribe failed'));

      await sendMessage('join-competition', buildCommand({ competitionId: COMPETITION_ID }));

      expect(handler.competitionId).toBeNull();
      expect(storage.set).not.toHaveBeenCalledWith('mqtt.competitionId', COMPETITION_ID);
      expect(onChange).not.toHaveBeenCalled();
      expect(broadcastHandler.unsubscribeFromCompetition).toHaveBeenCalled();
      const acknowledgements = vi
        .mocked(mqttClient.publish)
        .mock.calls.filter((call) => call[0].includes('/acknowledgement'));
      expect(JSON.parse(acknowledgements[1]![1]).status).toBe('error');
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
  it('does not emit another change for a duplicate join with a new command ID', async () => {
    await sendMessage('join-competition', buildCommand({ competitionId: COMPETITION_ID }));
    messageHandler(
      `saika/lane/${LANE_ID}/command/join-competition`,
      Buffer.from(
        JSON.stringify(
          buildCommand({
            competitionId: COMPETITION_ID,
            commandId: 'd4444444-4444-4444-a444-444444444444',
          }),
        ),
      ),
    );
    await flushPromises();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(membership.snapshot).toEqual({ competitionId: COMPETITION_ID, revision: 1 });
  });

  it('exposes saved membership before connecting and emits when restoration fails', async () => {
    storage.set('mqtt.competitionId', COMPETITION_ID);
    expect(membership.snapshot).toEqual({ competitionId: COMPETITION_ID, revision: 0 });
    vi.mocked(competitionStateSubscriber.subscribe).mockRejectedValueOnce(new Error('restore failed'));
    await handler.subscribe();
    expect(membership.snapshot).toEqual({ competitionId: null, revision: 1 });
    expect(onChange).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ competitionId: null, revision: 1 }));
  });

  it('retains membership without emitting on disconnect and successful restoration', async () => {
    await sendMessage('join-competition', buildCommand({ competitionId: COMPETITION_ID }));
    onChange.mockClear();
    await handler.unsubscribe();
    expect(membership.snapshot.competitionId).toBe(COMPETITION_ID);
    await handler.subscribe();
    expect(membership.snapshot.competitionId).toBe(COMPETITION_ID);
    expect(onChange).not.toHaveBeenCalled();
  });

  it.each(['retain', 'unsubscribe'])('keeps membership if leave %s cleanup fails', async (step) => {
    await sendMessage('join-competition', buildCommand({ competitionId: COMPETITION_ID }));
    onChange.mockClear();
    if (step === 'retain')
      vi.mocked(retainPublisher.clearCompetitionTopics).mockRejectedValueOnce(new Error('cleanup failed'));
    else vi.mocked(perLaneHandler.unsubscribeFromCompetition).mockRejectedValueOnce(new Error('cleanup failed'));
    messageHandler(
      `saika/lane/${LANE_ID}/command/leave-competition`,
      Buffer.from(
        JSON.stringify(
          buildCommand({
            competitionId: COMPETITION_ID,
            commandId: 'd4444444-4444-4444-a444-444444444444',
          }),
        ),
      ),
    );
    await flushPromises();
    expect(membership.snapshot).toEqual({ competitionId: COMPETITION_ID, revision: 1 });
    expect(onChange).not.toHaveBeenCalled();
    const acks = vi.mocked(mqttClient.publish).mock.calls.filter((call) => call[0].includes('/acknowledgement'));
    expect(JSON.parse(acks.at(-1)![1]).status).toBe('error');
  });

  it('emits leave only after retained cleanup, unsubscription and durable removal', async () => {
    await sendMessage('join-competition', buildCommand({ competitionId: COMPETITION_ID }));
    onChange.mockClear();
    let finishCleanup!: () => void;
    vi.mocked(retainPublisher.clearCompetitionTopics).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishCleanup = resolve;
        }),
    );
    let finishUnsubscribe!: () => void;
    vi.mocked(perLaneHandler.unsubscribeFromCompetition).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishUnsubscribe = resolve;
        }),
    );
    messageHandler(
      `saika/lane/${LANE_ID}/command/leave-competition`,
      Buffer.from(
        JSON.stringify(
          buildCommand({
            competitionId: COMPETITION_ID,
            commandId: 'd4444444-4444-4444-a444-444444444444',
          }),
        ),
      ),
    );
    await flushPromises();
    expect(membership.snapshot.competitionId).toBe(COMPETITION_ID);
    expect(onChange).not.toHaveBeenCalled();
    finishCleanup();
    await flushPromises();
    expect(membership.snapshot.competitionId).toBe(COMPETITION_ID);
    expect(onChange).not.toHaveBeenCalled();
    let storedAtEvent: unknown = COMPETITION_ID;
    onChange.mockImplementation(() => {
      storedAtEvent = storage.get('mqtt.competitionId');
    });
    finishUnsubscribe();
    await flushPromises();
    expect(membership.snapshot).toEqual({ competitionId: null, revision: 2 });
    expect(storedAtEvent).toBeUndefined();
    expect(onChange).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ competitionId: null, revision: 2 }));
  });
});
