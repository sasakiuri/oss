// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DirectorMqttService, type MqttControlSnapshot } from '@/main/modules/mqtt/infra/DirectorMqttService';
import type { IMqttTransport, MqttMessageHandler } from '@/main/modules/mqtt/infra/MqttTransport';

class FakeMqttTransport implements IMqttTransport {
  connected = false;
  connectCalls = 0;
  disconnectCalls = 0;
  disconnectError: Error | null = null;
  subscribeError: Error | null = null;
  subscribeBarrier: Promise<void> | null = null;
  publishBarrierForTopic: ((topic: string) => Promise<void> | null) | null = null;
  publishErrorForTopic: ((topic: string) => Error | null) | null = null;
  subscriptions: string[] = [];
  publications: Array<{
    topic: string;
    payload: string;
    options: { qos: 0 | 1 | 2; retain: boolean };
  }> = [];
  private messageHandlers = new Set<MqttMessageHandler>();
  private connectedHandlers = new Set<() => void>();
  private disconnectedHandlers = new Set<() => void>();
  private errorHandlers = new Set<(error: Error) => void>();

  async connect(): Promise<void> {
    this.connectCalls += 1;
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.disconnectCalls += 1;
    this.connected = false;
    this.disconnectedHandlers.forEach((handler) => handler());
    if (this.disconnectError) throw this.disconnectError;
  }

  async publish(topic: string, payload: string, options: { qos: 0 | 1 | 2; retain: boolean }): Promise<void> {
    await this.publishBarrierForTopic?.(topic);
    const error = this.publishErrorForTopic?.(topic);
    if (error) throw error;
    this.publications.push({ topic, payload, options });
  }

  async subscribe(topic: string): Promise<void> {
    await this.subscribeBarrier;
    if (this.subscribeError) throw this.subscribeError;
    this.subscriptions.push(topic);
  }

  onMessage(handler: MqttMessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onConnected(handler: () => void): () => void {
    this.connectedHandlers.add(handler);
    return () => this.connectedHandlers.delete(handler);
  }

  onDisconnected(handler: () => void): () => void {
    this.disconnectedHandlers.add(handler);
    return () => this.disconnectedHandlers.delete(handler);
  }

  onError(handler: (error: Error) => void): () => void {
    this.errorHandlers.add(handler);
    return () => this.errorHandlers.delete(handler);
  }

  isConnected(): boolean {
    return this.connected;
  }

  emitMessage(topic: string, payload: unknown): void {
    const buffer = Buffer.from(JSON.stringify(payload));
    this.messageHandlers.forEach((handler) => handler(topic, buffer));
  }

  emitRawMessage(topic: string, payload: Buffer): void {
    this.messageHandlers.forEach((handler) => handler(topic, payload));
  }

  emitConnected(): void {
    this.connected = true;
    this.connectedHandlers.forEach((handler) => handler());
  }

  emitDisconnected(): void {
    this.connected = false;
    this.disconnectedHandlers.forEach((handler) => handler());
  }
}

const LANE_ID = '11111111-1111-4111-8111-111111111111';
const SECOND_LANE_ID = '55555555-5555-4555-8555-555555555555';
const THIRD_LANE_ID = '66666666-6666-4666-8666-666666666666';
const COMPETITION_ID = '22222222-2222-4222-8222-222222222222';
const SECOND_COMPETITION_ID = '88888888-8888-4888-8888-888888888888';
const SESSION_ID = '33333333-3333-4333-8333-333333333333';
const PARTICIPANT_ID = '44444444-4444-4444-8444-444444444444';

function hardwareState() {
  return {
    laneId: LANE_ID,
    laneAlias: 'Lane 1',
    connection: { status: 'connected' as const, manufacturer: 'KOHTO' },
    appVersion: '0.3.0',
    publishedAt: new Date().toISOString(),
  };
}

function createService(transport: FakeMqttTransport, onStateChanged = vi.fn()) {
  return new DirectorMqttService(
    { directorId: 'director-test', commandTimeoutMs: 50, startDelayMs: 0, resubscribeRetryMs: 10 },
    { onStateChanged },
    transport,
  );
}

async function createCompetition(service: DirectorMqttService) {
  return service.createCompetition({
    competitionId: COMPETITION_ID,
    competitionTypeId: 'BR60S',
    competitionTypeName: '10m Beam Rifle 60 shots standing',
    discipline: 'BEAM_RIFLE_10M',
    roundName: 'Qualification',
    acc: 'DECIMAL',
    shotsPerSeries: 10,
    totalSeries: 6,
    totalShots: 60,
    laneIds: [LANE_ID],
  });
}

function finalLaneState(finalSnapshotCommandId?: string, sessionId = SESSION_ID) {
  return {
    competitionId: COMPETITION_ID,
    laneId: LANE_ID,
    sessionId,
    phase: 'FINISHED' as const,
    currentStage: { index: 1, name: 'Match', scored: true, totalSeries: 6 },
    currentSeries: { index: 5, shotsRecorded: 10, maxShots: 10 },
    ...(finalSnapshotCommandId ? { finalSnapshotCommandId } : {}),
    publishedAt: new Date().toISOString(),
  };
}

function finalLaneScore(totalScoreX10 = 6000, finalSnapshotCommandId?: string, sessionId = SESSION_ID) {
  const baseShotScore = Math.floor(totalScoreX10 / 60);
  const remainder = totalScoreX10 % 60;
  const shots = Array.from({ length: 60 }, (_, index) => baseShotScore + (index < remainder ? 1 : 0));
  const series = Array.from({ length: 6 }, (_, seriesIndex) => {
    const seriesShots = shots.slice(seriesIndex * 10, (seriesIndex + 1) * 10);
    return {
      seriesIndex,
      shots: seriesShots,
      seriesTotalX10: seriesShots.reduce((sum, shot) => sum + shot, 0),
      isComplete: true,
    };
  });

  return {
    competitionId: COMPETITION_ID,
    laneId: LANE_ID,
    sessionId,
    totalScoreX10,
    totalShotCount: 60,
    acc: 'DECIMAL' as const,
    stages: [
      {
        stageIndex: 1,
        stageName: 'Match',
        stageTotalX10: totalScoreX10,
        series,
      },
    ],
    ...(finalSnapshotCommandId ? { finalSnapshotCommandId } : {}),
    publishedAt: new Date().toISOString(),
  };
}

function emitFinalLaneSnapshots(
  transport: FakeMqttTransport,
  finalSnapshotCommandId: string,
  totalScoreX10 = 6000,
): void {
  transport.emitMessage(
    `saika/competition/${COMPETITION_ID}/lane/${LANE_ID}/state`,
    finalLaneState(finalSnapshotCommandId),
  );
  transport.emitMessage(
    `saika/competition/${COMPETITION_ID}/lane/${LANE_ID}/score`,
    finalLaneScore(totalScoreX10, finalSnapshotCommandId),
  );
}

async function createCompetitionGroup(
  service: DirectorMqttService,
  competitionId: string,
  competitionTypeId: 'BR60S' | 'BP60',
  laneIds: string[],
) {
  const isRifle = competitionTypeId === 'BR60S';
  return service.createCompetition({
    competitionId,
    competitionTypeId,
    competitionTypeName: isRifle ? '10m Beam Rifle 60 shots standing' : '10m Beam Pistol 60 shots',
    discipline: isRifle ? 'BEAM_RIFLE_10M' : 'BEAM_PISTOL_10M',
    roundName: 'Qualification',
    acc: isRifle ? 'DECIMAL' : 'RING',
    shotsPerSeries: 10,
    totalSeries: 6,
    totalShots: 60,
    laneIds,
  });
}

describe('DirectorMqttService', () => {
  let transport: FakeMqttTransport;

  beforeEach(() => {
    transport = new FakeMqttTransport();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('cleans up the transport when topic subscription fails during connection', async () => {
    transport.subscribeError = new Error('subscription rejected');
    const service = createService(transport);

    await expect(service.connect('mqtt://localhost:1883')).rejects.toThrow('subscription rejected');

    expect(transport.disconnectCalls).toBe(1);
    expect(transport.connected).toBe(false);
    expect(service.getSnapshot()).toMatchObject({ connected: false, brokerUrl: null });
  });

  it('can reconnect to the same broker after transport disconnect reports an error', async () => {
    const onStateChanged = vi.fn<(snapshot: MqttControlSnapshot) => void>();
    const service = createService(transport, onStateChanged);
    await service.connect('mqtt://localhost:1883');
    transport.disconnectError = new Error('disconnect failed');

    await expect(service.disconnect()).rejects.toThrow('disconnect failed');

    expect(service.getSnapshot().connected).toBe(false);
    expect(onStateChanged).toHaveBeenLastCalledWith(expect.objectContaining({ connected: false }));

    transport.disconnectError = null;
    await service.connect('mqtt://localhost:1883');

    expect(transport.connectCalls).toBe(2);
    expect(service.getSnapshot().connected).toBe(true);
  });

  it('subscribes to director topics and aggregates hardware state', async () => {
    const onStateChanged = vi.fn<(snapshot: MqttControlSnapshot) => void>();
    const service = createService(transport, onStateChanged);

    await service.connect('mqtt://localhost:1883');
    transport.emitMessage(`saika/lane/${LANE_ID}/hardware/state`, hardwareState());

    expect(transport.subscriptions).toEqual([
      'saika/lane/+/hardware/#',
      'saika/lane/+/command/+/acknowledgement',
      'saika/competition/+/#',
    ]);
    expect(service.getSnapshot().lanes[0]).toMatchObject({
      laneId: LANE_ID,
      laneAlias: 'Lane 1',
      hardware: { connection: { status: 'connected' } },
    });
    expect(onStateChanged).toHaveBeenCalled();
  });

  it('treats a retained connected heartbeat as offline after its freshness window expires', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-28T00:05:00.000Z'));
    const service = createService(transport);
    await service.connect('mqtt://localhost:1883');

    transport.emitMessage(`saika/lane/${LANE_ID}/hardware/state`, {
      ...hardwareState(),
      publishedAt: '2026-08-28T00:02:29.999Z',
    });

    expect(service.getSnapshot().lanes[0]).toMatchObject({
      laneId: LANE_ID,
      hardware: { connection: { status: 'offline' } },
      lastSeenAt: '2026-08-28T00:02:29.999Z',
    });

    transport.emitMessage(`saika/lane/${LANE_ID}/hardware/state`, {
      ...hardwareState(),
      publishedAt: '2026-08-28T00:05:00.000Z',
    });
    expect(service.getSnapshot().lanes[0]?.hardware?.connection.status).toBe('connected');

    await vi.advanceTimersByTimeAsync(149_999);
    expect(service.getSnapshot().lanes[0]?.hardware?.connection.status).toBe('connected');
    await vi.advanceTimersByTimeAsync(1);
    expect(service.getSnapshot().lanes[0]?.hardware?.connection.status).toBe('offline');
    await service.disconnect();
  });

  it('publishes retained competition state before joining and resolves the lane ACK', async () => {
    const service = createService(transport);
    await service.connect('mqtt://localhost:1883');
    await createCompetition(service);

    const resultPromise = service.joinCompetition(COMPETITION_ID, [LANE_ID]);
    await vi.waitFor(() => {
      expect(transport.publications.some((entry) => entry.topic.endsWith('/join-competition'))).toBe(true);
    });

    const commandPublication = transport.publications.find((entry) => entry.topic.endsWith('/join-competition'))!;
    const command = JSON.parse(commandPublication.payload) as { commandId: string };
    transport.emitMessage(`saika/lane/${LANE_ID}/command/join-competition/acknowledgement`, {
      commandId: command.commandId,
      laneId: LANE_ID,
      status: 'done',
      acknowledgedAt: new Date().toISOString(),
    });

    await expect(resultPromise).resolves.toMatchObject({
      success: true,
      commands: [{ success: true, lanes: [{ laneId: LANE_ID, status: 'done' }] }],
    });
    expect(transport.publications[0]).toMatchObject({
      topic: `saika/competition/${COMPETITION_ID}/state`,
      options: { qos: 1, retain: true },
    });
  });

  it('preserves every Lane when joins for the same competition overlap', async () => {
    const service = createService(transport);
    await service.connect('mqtt://localhost:1883');
    await service.createCompetition({
      competitionId: COMPETITION_ID,
      competitionTypeId: 'BR60S',
      competitionTypeName: '10m Beam Rifle 60 shots standing',
      discipline: 'BEAM_RIFLE_10M',
      roundName: 'Qualification',
      acc: 'DECIMAL',
      shotsPerSeries: 10,
      totalSeries: 6,
      totalShots: 60,
      laneIds: [],
    });

    const firstJoin = service.joinCompetition(COMPETITION_ID, [LANE_ID]);
    const secondJoin = service.joinCompetition(COMPETITION_ID, [SECOND_LANE_ID]);
    const acknowledgedCommandIds = new Set<string>();

    const acknowledgePublishedJoins = (): void => {
      for (const publication of transport.publications.filter((entry) => entry.topic.endsWith('/join-competition'))) {
        const command = JSON.parse(publication.payload) as { commandId: string };
        if (acknowledgedCommandIds.has(command.commandId)) continue;
        acknowledgedCommandIds.add(command.commandId);
        const laneId = publication.topic.split('/')[2]!;
        transport.emitMessage(`saika/lane/${laneId}/command/join-competition/acknowledgement`, {
          commandId: command.commandId,
          laneId,
          status: 'done',
          acknowledgedAt: new Date().toISOString(),
        });
      }
    };

    await vi.waitFor(() => {
      expect(
        transport.publications.filter((entry) => entry.topic.endsWith('/join-competition')).length,
      ).toBeGreaterThan(0);
    });
    acknowledgePublishedJoins();
    await vi.waitFor(() => {
      expect(transport.publications.filter((entry) => entry.topic.endsWith('/join-competition'))).toHaveLength(2);
    });
    acknowledgePublishedJoins();

    await expect(Promise.all([firstJoin, secondJoin])).resolves.toEqual([
      expect.objectContaining({ success: true }),
      expect.objectContaining({ success: true }),
    ]);
    expect(service.getSnapshot().competitions[0]?.laneIds).toEqual([LANE_ID, SECOND_LANE_ID]);
  });

  it('does not start sighting for a provisional competition with no joined Lanes', async () => {
    const service = createService(transport);
    await service.connect('mqtt://localhost:1883');
    await createCompetitionGroup(service, COMPETITION_ID, 'BR60S', []);
    const publicationCount = transport.publications.length;

    await expect(service.startSighting(COMPETITION_ID, 600)).rejects.toThrow(
      'Cannot start sighting for a competition with no joined Lanes',
    );

    expect(transport.publications).toHaveLength(publicationCount);
    expect(service.getSnapshot().competitions[0]?.phase).toBe('NOT_STARTED');
  });

  it('retains provisional membership when a join acknowledgement is ambiguous', async () => {
    const service = createService(transport);
    await service.connect('mqtt://localhost:1883');
    await createCompetitionGroup(service, COMPETITION_ID, 'BR60S', []);

    await expect(service.joinCompetition(COMPETITION_ID, [LANE_ID])).resolves.toMatchObject({
      success: false,
      commands: [{ lanes: [{ laneId: LANE_ID, status: 'timeout' }] }],
    });

    expect(service.getSnapshot().competitions[0]).toMatchObject({
      laneIds: [LANE_ID],
      pendingJoinLaneIds: [LANE_ID],
    });
    await expect(service.startSighting(COMPETITION_ID, 600)).rejects.toThrow(
      '1 Lane(s) have unconfirmed competition membership',
    );

    const retry = service.joinCompetition(COMPETITION_ID, [LANE_ID]);
    await vi.waitFor(() =>
      expect(transport.publications.filter((entry) => entry.topic.endsWith('/join-competition'))).toHaveLength(2),
    );
    const retryPublication = transport.publications
      .filter((entry) => entry.topic.endsWith('/join-competition'))
      .at(-1)!;
    const retryCommand = JSON.parse(retryPublication.payload) as { commandId: string };
    transport.emitMessage(`saika/lane/${LANE_ID}/command/join-competition/acknowledgement`, {
      commandId: retryCommand.commandId,
      laneId: LANE_ID,
      status: 'done',
      acknowledgedAt: new Date().toISOString(),
    });

    await expect(retry).resolves.toMatchObject({ success: true });
    expect(service.getSnapshot().competitions[0]?.pendingJoinLaneIds).toBeUndefined();
  });

  it('releases provisional membership after a definitive join rejection', async () => {
    const service = createService(transport);
    await service.connect('mqtt://localhost:1883');
    await createCompetitionGroup(service, COMPETITION_ID, 'BR60S', []);

    const joining = service.joinCompetition(COMPETITION_ID, [LANE_ID]);
    await vi.waitFor(() =>
      expect(transport.publications.filter((entry) => entry.topic.endsWith('/join-competition'))).toHaveLength(1),
    );
    const publication = transport.publications.find((entry) => entry.topic.endsWith('/join-competition'))!;
    const command = JSON.parse(publication.payload) as { commandId: string };
    transport.emitMessage(`saika/lane/${LANE_ID}/command/join-competition/acknowledgement`, {
      commandId: command.commandId,
      laneId: LANE_ID,
      status: 'error',
      error: { code: 'MQTT_ALREADY_IN_COMPETITION', message: 'Lane belongs to another competition' },
      acknowledgedAt: new Date().toISOString(),
    });

    await expect(joining).resolves.toMatchObject({ success: false });
    expect(service.getSnapshot().competitions[0]).toMatchObject({ laneIds: [] });
    expect(service.getSnapshot().competitions[0]?.pendingJoinLaneIds).toBeUndefined();
  });

  it('does not let overlapping competitions both reserve the same Lane', async () => {
    const service = createService(transport);
    await service.connect('mqtt://localhost:1883');
    await createCompetitionGroup(service, COMPETITION_ID, 'BR60S', []);
    await createCompetitionGroup(service, SECOND_COMPETITION_ID, 'BP60', []);

    const firstJoin = service.joinCompetition(COMPETITION_ID, [LANE_ID]);
    const conflictingJoin = service.joinCompetition(SECOND_COMPETITION_ID, [LANE_ID]);
    await vi.waitFor(() => {
      expect(transport.publications.filter((entry) => entry.topic.endsWith('/join-competition'))).toHaveLength(1);
    });
    const publication = transport.publications.find((entry) => entry.topic.endsWith('/join-competition'))!;
    const command = JSON.parse(publication.payload) as { commandId: string };
    transport.emitMessage(`saika/lane/${LANE_ID}/command/join-competition/acknowledgement`, {
      commandId: command.commandId,
      laneId: LANE_ID,
      status: 'done',
      acknowledgedAt: new Date().toISOString(),
    });

    await expect(firstJoin).resolves.toMatchObject({ success: true });
    await expect(conflictingJoin).rejects.toThrow(`Lane ${LANE_ID} is already joined to competition ${COMPETITION_ID}`);
    expect(transport.publications.filter((entry) => entry.topic.endsWith('/join-competition'))).toHaveLength(1);
  });

  it('collects broadcast ACK errors without marking the command successful', async () => {
    const service = createService(transport);
    await service.connect('mqtt://localhost:1883');
    await createCompetition(service);

    const resultPromise = service.startSighting(COMPETITION_ID, 600);
    await vi.waitFor(() => {
      expect(transport.publications.some((entry) => entry.topic.endsWith('/start-sighting'))).toBe(true);
    });
    const publication = transport.publications.find((entry) => entry.topic.endsWith('/start-sighting'))!;
    const command = JSON.parse(publication.payload) as { commandId: string };
    transport.emitMessage(`saika/competition/${COMPETITION_ID}/command/start-sighting/acknowledgement/${LANE_ID}`, {
      commandId: command.commandId,
      laneId: LANE_ID,
      status: 'error',
      error: { code: 'INVALID_PHASE', message: 'Lane is not ready' },
      acknowledgedAt: new Date().toISOString(),
    });

    await expect(resultPromise).resolves.toMatchObject({
      success: false,
      lanes: [
        {
          laneId: LANE_ID,
          status: 'error',
          error: { code: 'INVALID_PHASE' },
        },
      ],
    });
    expect(service.getSnapshot().competitions[0]?.phase).toBe('NOT_STARTED');
  });

  it('accepts an ACK only from the exact topic expected for its command', async () => {
    const service = createService(transport);
    await service.connect('mqtt://localhost:1883');
    await createCompetition(service);

    const resultPromise = service.startSighting(COMPETITION_ID, 600);
    await vi.waitFor(() =>
      expect(transport.publications.some((entry) => entry.topic.endsWith('/start-sighting'))).toBe(true),
    );
    const publication = transport.publications.find((entry) => entry.topic.endsWith('/start-sighting'))!;
    const command = JSON.parse(publication.payload) as { commandId: string };
    const acknowledgement = {
      commandId: command.commandId,
      laneId: LANE_ID,
      status: 'done',
      acknowledgedAt: new Date().toISOString(),
    };

    transport.emitMessage(
      `saika/competition/${COMPETITION_ID}/command/start-sighting/acknowledgement/${SECOND_LANE_ID}`,
      acknowledgement,
    );
    transport.emitMessage(`saika/competition/${COMPETITION_ID}/command/end-sighting/acknowledgement/${LANE_ID}`, {
      ...acknowledgement,
    });
    transport.emitMessage(
      `saika/competition/${SESSION_ID}/command/start-sighting/acknowledgement/${LANE_ID}`,
      acknowledgement,
    );
    expect(service.getSnapshot().lastCommand).toBeNull();

    transport.emitMessage(
      `saika/competition/${COMPETITION_ID}/command/start-sighting/acknowledgement/${LANE_ID}`,
      acknowledgement,
    );

    await expect(resultPromise).resolves.toMatchObject({
      success: true,
      lanes: [{ laneId: LANE_ID, status: 'done' }],
    });
  });

  it('does not let a delayed executing ACK overwrite a terminal ACK', async () => {
    const service = createService(transport);
    await service.connect('mqtt://localhost:1883');
    await service.createCompetition({
      competitionId: COMPETITION_ID,
      competitionTypeId: 'BR60S',
      competitionTypeName: '10m Beam Rifle 60 shots standing',
      discipline: 'BEAM_RIFLE_10M',
      roundName: 'Qualification',
      acc: 'DECIMAL',
      shotsPerSeries: 10,
      totalSeries: 6,
      totalShots: 60,
      laneIds: [LANE_ID, SECOND_LANE_ID],
    });

    const resultPromise = service.startSighting(COMPETITION_ID, 600);
    await vi.waitFor(() =>
      expect(transport.publications.some((entry) => entry.topic.endsWith('/start-sighting'))).toBe(true),
    );
    const publication = transport.publications.find((entry) => entry.topic.endsWith('/start-sighting'))!;
    const command = JSON.parse(publication.payload) as { commandId: string };
    const acknowledgedAt = new Date().toISOString();
    const acknowledgementTopic = (laneId: string) =>
      `saika/competition/${COMPETITION_ID}/command/start-sighting/acknowledgement/${laneId}`;

    transport.emitMessage(acknowledgementTopic(LANE_ID), {
      commandId: command.commandId,
      laneId: LANE_ID,
      status: 'done',
      acknowledgedAt,
    });
    transport.emitMessage(acknowledgementTopic(LANE_ID), {
      commandId: command.commandId,
      laneId: LANE_ID,
      status: 'executing',
      acknowledgedAt: new Date().toISOString(),
    });
    transport.emitMessage(acknowledgementTopic(SECOND_LANE_ID), {
      commandId: command.commandId,
      laneId: SECOND_LANE_ID,
      status: 'done',
      acknowledgedAt: new Date().toISOString(),
    });

    await expect(resultPromise).resolves.toMatchObject({
      success: true,
      lanes: [
        { laneId: LANE_ID, status: 'done', acknowledgedAt },
        { laneId: SECOND_LANE_ID, status: 'done' },
      ],
    });
  });

  it('rejects a fully completed phase command instead of broadcasting it again', async () => {
    const service = createService(transport);
    await service.connect('mqtt://localhost:1883');
    await createCompetition(service);

    const firstStart = service.startSighting(COMPETITION_ID, 600);
    await vi.waitFor(() =>
      expect(transport.publications.some((entry) => entry.topic.endsWith('/start-sighting'))).toBe(true),
    );
    const publication = transport.publications.find((entry) => entry.topic.endsWith('/start-sighting'))!;
    const command = JSON.parse(publication.payload) as { commandId: string };
    transport.emitMessage(`saika/competition/${COMPETITION_ID}/command/start-sighting/acknowledgement/${LANE_ID}`, {
      commandId: command.commandId,
      laneId: LANE_ID,
      status: 'done',
      acknowledgedAt: new Date().toISOString(),
    });
    await expect(firstStart).resolves.toMatchObject({ success: true });
    const startPublicationCount = transport.publications.filter((entry) =>
      entry.topic.endsWith('/start-sighting'),
    ).length;

    await expect(service.startSighting(COMPETITION_ID, 600)).rejects.toThrow('phase SIGHTING');
    expect(transport.publications.filter((entry) => entry.topic.endsWith('/start-sighting'))).toHaveLength(
      startPublicationCount,
    );
    await service.disconnect();
  });

  it('retains and retries only the Lanes left incomplete by a partial sighting start', async () => {
    const firstNow = Date.now();
    const now = vi.spyOn(Date, 'now').mockReturnValue(firstNow);
    const service = createService(transport);
    await service.connect('mqtt://localhost:1883');
    await service.createCompetition({
      competitionId: COMPETITION_ID,
      competitionTypeId: 'BR60S',
      competitionTypeName: '10m Beam Rifle 60 shots standing',
      discipline: 'BEAM_RIFLE_10M',
      roundName: 'Qualification',
      acc: 'DECIMAL',
      shotsPerSeries: 10,
      totalSeries: 6,
      totalShots: 60,
      laneIds: [LANE_ID, SECOND_LANE_ID],
    });

    const firstStart = service.startSighting(COMPETITION_ID, 600);
    await vi.waitFor(() =>
      expect(transport.publications.some((entry) => entry.topic.endsWith('/start-sighting'))).toBe(true),
    );
    const firstPublication = transport.publications.find((entry) => entry.topic.endsWith('/start-sighting'))!;
    const firstCommand = JSON.parse(firstPublication.payload) as { commandId: string; timerStartAt: string };
    transport.emitMessage(`saika/competition/${COMPETITION_ID}/command/start-sighting/acknowledgement/${LANE_ID}`, {
      commandId: firstCommand.commandId,
      laneId: LANE_ID,
      status: 'done',
      acknowledgedAt: new Date().toISOString(),
    });
    transport.emitMessage(
      `saika/competition/${COMPETITION_ID}/command/start-sighting/acknowledgement/${SECOND_LANE_ID}`,
      {
        commandId: firstCommand.commandId,
        laneId: SECOND_LANE_ID,
        status: 'error',
        error: { code: 'INVALID_PHASE', message: 'Lane is not ready' },
        acknowledgedAt: new Date().toISOString(),
      },
    );
    await expect(firstStart).resolves.toMatchObject({
      success: false,
      lanes: [
        { laneId: LANE_ID, status: 'done' },
        { laneId: SECOND_LANE_ID, status: 'error' },
      ],
    });
    expect(service.getSnapshot().competitions[0]).toMatchObject({
      phase: 'SIGHTING',
      startedAt: firstCommand.timerStartAt,
      activeTimer: {
        timerScope: 'STAGE',
        timerStartAt: firstCommand.timerStartAt,
        timerDurationSeconds: 600,
        stageIndex: 0,
        seriesIndex: null,
      },
      pendingSightingLaneIds: [SECOND_LANE_ID],
    });
    await expect(service.endSighting(COMPETITION_ID)).rejects.toThrow('1 Lane(s) have not started sighting');

    now.mockReturnValue(firstNow + 60_000);
    const secondStart = service.startSighting(COMPETITION_ID, 600, [SECOND_LANE_ID]);
    await vi.waitFor(() =>
      expect(transport.publications.filter((entry) => entry.topic.endsWith('/start-sighting'))).toHaveLength(2),
    );
    const secondPublication = transport.publications.filter((entry) => entry.topic.endsWith('/start-sighting')).at(-1)!;
    const secondCommand = JSON.parse(secondPublication.payload) as {
      commandId: string;
      timerStartAt: string;
      targetLaneIds: string[];
    };
    expect(secondCommand.timerStartAt).toBe(firstCommand.timerStartAt);
    expect(secondCommand.targetLaneIds).toEqual([SECOND_LANE_ID]);
    transport.emitMessage(
      `saika/competition/${COMPETITION_ID}/command/start-sighting/acknowledgement/${SECOND_LANE_ID}`,
      {
        commandId: secondCommand.commandId,
        laneId: SECOND_LANE_ID,
        status: 'done',
        acknowledgedAt: new Date().toISOString(),
      },
    );

    await expect(secondStart).resolves.toMatchObject({
      success: true,
      lanes: [{ laneId: SECOND_LANE_ID, status: 'done' }],
    });
    expect(service.getSnapshot().competitions[0]).toMatchObject({
      phase: 'SIGHTING',
      startedAt: firstCommand.timerStartAt,
    });
    expect(service.getSnapshot().competitions[0]?.pendingSightingLaneIds).toBeUndefined();
    await service.disconnect();
  });

  it('reuses the sighting deadline when the phase state cannot be retained after Lane acknowledgement', async () => {
    const firstNow = Date.now();
    const now = vi.spyOn(Date, 'now').mockReturnValue(firstNow);
    const service = createService(transport);
    await service.connect('mqtt://localhost:1883');
    await createCompetition(service);

    const firstStart = service.startSighting(COMPETITION_ID, 600);
    await vi.waitFor(() =>
      expect(transport.publications.filter((entry) => entry.topic.endsWith('/start-sighting'))).toHaveLength(1),
    );
    const firstPublication = transport.publications.find((entry) => entry.topic.endsWith('/start-sighting'))!;
    const firstCommand = JSON.parse(firstPublication.payload) as { commandId: string; timerStartAt: string };
    transport.publishErrorForTopic = (topic) =>
      topic === `saika/competition/${COMPETITION_ID}/state` ? new Error('retained state unavailable') : null;
    transport.emitMessage(`saika/competition/${COMPETITION_ID}/command/start-sighting/acknowledgement/${LANE_ID}`, {
      commandId: firstCommand.commandId,
      laneId: LANE_ID,
      status: 'done',
      acknowledgedAt: new Date().toISOString(),
    });

    await expect(firstStart).rejects.toThrow('retained state unavailable');
    const retainedState = service.getSnapshot().competitions[0]!;
    expect(retainedState).toMatchObject({
      phase: 'NOT_STARTED',
      pendingTimer: {
        action: 'start-sighting',
        timerStartAt: firstCommand.timerStartAt,
        timerDurationSeconds: 600,
      },
    });
    transport.publishErrorForTopic = null;
    await service.disconnect();

    transport = new FakeMqttTransport();
    const restartedService = createService(transport);
    await restartedService.connect('mqtt://localhost:1883');
    transport.emitMessage(`saika/competition/${COMPETITION_ID}/state`, retainedState);
    now.mockReturnValue(firstNow + 60_000);

    const retry = restartedService.startSighting(COMPETITION_ID, 600);
    await vi.waitFor(() =>
      expect(transport.publications.filter((entry) => entry.topic.endsWith('/start-sighting'))).toHaveLength(1),
    );
    const retryPublication = transport.publications.filter((entry) => entry.topic.endsWith('/start-sighting')).at(-1)!;
    const retryCommand = JSON.parse(retryPublication.payload) as { commandId: string; timerStartAt: string };
    expect(retryCommand.timerStartAt).toBe(firstCommand.timerStartAt);
    transport.emitMessage(`saika/competition/${COMPETITION_ID}/command/start-sighting/acknowledgement/${LANE_ID}`, {
      commandId: retryCommand.commandId,
      laneId: LANE_ID,
      status: 'done',
      acknowledgedAt: new Date().toISOString(),
    });

    await expect(retry).resolves.toMatchObject({ success: true });
    expect(restartedService.getSnapshot().competitions[0]?.pendingTimer).toBeUndefined();
    await restartedService.disconnect();
  });

  it('starts a fresh sighting timer after every previously targeted Lane leaves', async () => {
    const firstNow = Date.parse('2026-08-28T00:00:00.000Z');
    const now = vi.spyOn(Date, 'now').mockReturnValue(firstNow);
    const service = createService(transport);
    await service.connect('mqtt://localhost:1883');
    await createCompetition(service);

    const firstStart = service.startSighting(COMPETITION_ID, 600);
    await vi.waitFor(() =>
      expect(transport.publications.filter((entry) => entry.topic.endsWith('/start-sighting'))).toHaveLength(1),
    );
    const firstPublication = transport.publications.find((entry) => entry.topic.endsWith('/start-sighting'))!;
    const firstCommand = JSON.parse(firstPublication.payload) as { commandId: string; timerStartAt: string };
    transport.emitMessage(`saika/competition/${COMPETITION_ID}/command/start-sighting/acknowledgement/${LANE_ID}`, {
      commandId: firstCommand.commandId,
      laneId: LANE_ID,
      status: 'error',
      error: { code: 'INVALID_PHASE', message: 'Lane is not ready' },
      acknowledgedAt: new Date().toISOString(),
    });
    await expect(firstStart).resolves.toMatchObject({ success: false });
    expect(service.getSnapshot().competitions[0]?.pendingTimer).toMatchObject({
      action: 'start-sighting',
      timerStartAt: firstCommand.timerStartAt,
    });

    const leaving = service.leaveCompetition(COMPETITION_ID, [LANE_ID]);
    await vi.waitFor(() =>
      expect(transport.publications.filter((entry) => entry.topic.endsWith('/leave-competition'))).toHaveLength(1),
    );
    const leavePublication = transport.publications.find((entry) => entry.topic.endsWith('/leave-competition'))!;
    const leaveCommand = JSON.parse(leavePublication.payload) as { commandId: string };
    transport.emitMessage(`saika/lane/${LANE_ID}/command/leave-competition/acknowledgement`, {
      commandId: leaveCommand.commandId,
      laneId: LANE_ID,
      status: 'done',
      acknowledgedAt: new Date().toISOString(),
    });
    await expect(leaving).resolves.toMatchObject({ success: true });
    expect(service.getSnapshot().competitions[0]?.laneIds).toEqual([]);
    expect(service.getSnapshot().competitions[0]?.pendingTimer).toBeUndefined();

    now.mockReturnValue(firstNow + 60_000);
    const joining = service.joinCompetition(COMPETITION_ID, [SECOND_LANE_ID]);
    await vi.waitFor(() =>
      expect(transport.publications.filter((entry) => entry.topic.endsWith('/join-competition'))).toHaveLength(1),
    );
    const joinPublication = transport.publications.find((entry) => entry.topic.endsWith('/join-competition'))!;
    const joinCommand = JSON.parse(joinPublication.payload) as { commandId: string };
    transport.emitMessage(`saika/lane/${SECOND_LANE_ID}/command/join-competition/acknowledgement`, {
      commandId: joinCommand.commandId,
      laneId: SECOND_LANE_ID,
      status: 'done',
      acknowledgedAt: new Date().toISOString(),
    });
    await expect(joining).resolves.toMatchObject({ success: true });

    const retry = service.startSighting(COMPETITION_ID, 600);
    await vi.waitFor(() =>
      expect(transport.publications.filter((entry) => entry.topic.endsWith('/start-sighting'))).toHaveLength(2),
    );
    const retryPublication = transport.publications.filter((entry) => entry.topic.endsWith('/start-sighting')).at(-1)!;
    const retryCommand = JSON.parse(retryPublication.payload) as { commandId: string; timerStartAt: string };
    transport.emitMessage(
      `saika/competition/${COMPETITION_ID}/command/start-sighting/acknowledgement/${SECOND_LANE_ID}`,
      {
        commandId: retryCommand.commandId,
        laneId: SECOND_LANE_ID,
        status: 'done',
        acknowledgedAt: new Date().toISOString(),
      },
    );

    await expect(retry).resolves.toMatchObject({ success: true });
    expect(retryCommand.timerStartAt).toBe(new Date(firstNow + 60_000).toISOString());
    expect(retryCommand.timerStartAt).not.toBe(firstCommand.timerStartAt);
    await service.disconnect();
  });

  it('reuses the match deadline when the phase state cannot be retained after Lane acknowledgement', async () => {
    const firstNow = Date.now();
    const now = vi.spyOn(Date, 'now').mockReturnValue(firstNow);
    const service = createService(transport);
    await service.connect('mqtt://localhost:1883');
    const created = await createCompetition(service);
    transport.emitMessage(`saika/competition/${COMPETITION_ID}/state`, {
      ...created,
      phase: 'SIGHTING_COMPLETE',
      startedAt: new Date().toISOString(),
      publishedAt: new Date(Date.parse(created.publishedAt) + 1).toISOString(),
    });

    const firstStart = service.startMatch(COMPETITION_ID, 2_700);
    await vi.waitFor(() =>
      expect(transport.publications.filter((entry) => entry.topic.endsWith('/start-match'))).toHaveLength(1),
    );
    const firstPublication = transport.publications.find((entry) => entry.topic.endsWith('/start-match'))!;
    const firstCommand = JSON.parse(firstPublication.payload) as { commandId: string; timerStartAt: string };
    transport.publishErrorForTopic = (topic) =>
      topic === `saika/competition/${COMPETITION_ID}/state` ? new Error('retained state unavailable') : null;
    transport.emitMessage(`saika/competition/${COMPETITION_ID}/command/start-match/acknowledgement/${LANE_ID}`, {
      commandId: firstCommand.commandId,
      laneId: LANE_ID,
      status: 'done',
      acknowledgedAt: new Date().toISOString(),
    });

    await expect(firstStart).rejects.toThrow('retained state unavailable');
    expect(service.getSnapshot().competitions[0]).toMatchObject({
      phase: 'SIGHTING_COMPLETE',
      pendingTimer: {
        action: 'start-match',
        timerStartAt: firstCommand.timerStartAt,
        timerDurationSeconds: 2_700,
      },
    });
    transport.publishErrorForTopic = null;
    now.mockReturnValue(firstNow + 60_000);

    const retry = service.startMatch(COMPETITION_ID, 2_700);
    await vi.waitFor(() =>
      expect(transport.publications.filter((entry) => entry.topic.endsWith('/start-match'))).toHaveLength(2),
    );
    const retryPublication = transport.publications.filter((entry) => entry.topic.endsWith('/start-match')).at(-1)!;
    const retryCommand = JSON.parse(retryPublication.payload) as { commandId: string; timerStartAt: string };
    expect(retryCommand.timerStartAt).toBe(firstCommand.timerStartAt);
    transport.emitMessage(`saika/competition/${COMPETITION_ID}/command/start-match/acknowledgement/${LANE_ID}`, {
      commandId: retryCommand.commandId,
      laneId: LANE_ID,
      status: 'done',
      acknowledgedAt: new Date().toISOString(),
    });

    await expect(retry).resolves.toMatchObject({ success: true });
    expect(service.getSnapshot().competitions[0]?.pendingTimer).toBeUndefined();
    await service.disconnect();
  });

  it('reuses a restarted timer deadline when its retained state update fails after Lane acknowledgement', async () => {
    const firstNow = Date.now();
    const now = vi.spyOn(Date, 'now').mockReturnValue(firstNow);
    const service = createService(transport);
    await service.connect('mqtt://localhost:1883');
    const created = await createCompetition(service);
    transport.emitMessage(`saika/competition/${COMPETITION_ID}/state`, {
      ...created,
      phase: 'MATCH',
      startedAt: new Date().toISOString(),
      activeTimer: {
        timerScope: 'STAGE',
        timerStartAt: new Date(firstNow + 3_600_000).toISOString(),
        timerDurationSeconds: 3_600,
        stageIndex: 1,
        seriesIndex: null,
      },
      publishedAt: new Date(Date.parse(created.publishedAt) + 1).toISOString(),
    });

    const firstRestart = service.restartTimer(COMPETITION_ID, 'SERIES', 90, 1, 2);
    await vi.waitFor(() =>
      expect(transport.publications.filter((entry) => entry.topic.endsWith('/timer-started'))).toHaveLength(1),
    );
    const firstPublication = transport.publications.find((entry) => entry.topic.endsWith('/timer-started'))!;
    const firstCommand = JSON.parse(firstPublication.payload) as { commandId: string; timerStartAt: string };
    transport.publishErrorForTopic = (topic) =>
      topic === `saika/competition/${COMPETITION_ID}/state` ? new Error('retained state unavailable') : null;
    transport.emitMessage(`saika/competition/${COMPETITION_ID}/command/timer-started/acknowledgement/${LANE_ID}`, {
      commandId: firstCommand.commandId,
      laneId: LANE_ID,
      status: 'done',
      acknowledgedAt: new Date().toISOString(),
    });

    await expect(firstRestart).rejects.toThrow('retained state unavailable');
    expect(service.getSnapshot().competitions[0]).toMatchObject({
      phase: 'MATCH',
      activeTimer: { timerScope: 'STAGE' },
      pendingTimer: {
        action: 'timer-started',
        timerStartAt: firstCommand.timerStartAt,
        timerDurationSeconds: 90,
      },
    });
    transport.publishErrorForTopic = null;
    now.mockReturnValue(firstNow + 60_000);

    const retry = service.restartTimer(COMPETITION_ID, 'SERIES', 90, 1, 2);
    await vi.waitFor(() =>
      expect(transport.publications.filter((entry) => entry.topic.endsWith('/timer-started'))).toHaveLength(2),
    );
    const retryPublication = transport.publications.filter((entry) => entry.topic.endsWith('/timer-started')).at(-1)!;
    const retryCommand = JSON.parse(retryPublication.payload) as { commandId: string; timerStartAt: string };
    expect(retryCommand.timerStartAt).toBe(firstCommand.timerStartAt);
    transport.emitMessage(`saika/competition/${COMPETITION_ID}/command/timer-started/acknowledgement/${LANE_ID}`, {
      commandId: retryCommand.commandId,
      laneId: LANE_ID,
      status: 'done',
      acknowledgedAt: new Date().toISOString(),
    });

    await expect(retry).resolves.toMatchObject({ success: true });
    expect(service.getSnapshot().competitions[0]).toMatchObject({
      activeTimer: { timerStartAt: firstCommand.timerStartAt },
    });
    expect(service.getSnapshot().competitions[0]?.pendingTimer).toBeUndefined();
    await service.disconnect();
  });

  it('rejects timer restarts before the competition starts and after it completes', async () => {
    const service = createService(transport);
    await service.connect('mqtt://localhost:1883');
    const created = await createCompetition(service);

    await expect(service.restartTimer(COMPETITION_ID, 'STAGE', 60, 0, null)).rejects.toThrow('Cannot restart timer');
    expect(transport.publications.some((entry) => entry.topic.endsWith('/timer-started'))).toBe(false);

    const finishedAt = new Date(Date.parse(created.publishedAt) + 1).toISOString();
    transport.emitMessage(`saika/competition/${COMPETITION_ID}/state`, {
      ...created,
      phase: 'MATCH_COMPLETE',
      startedAt: finishedAt,
      finishedAt,
      publishedAt: new Date(Date.parse(created.publishedAt) + 2).toISOString(),
    });

    await expect(service.restartTimer(COMPETITION_ID, 'STAGE', 60, 1, null)).rejects.toThrow('Cannot restart timer');
    expect(transport.publications.some((entry) => entry.topic.endsWith('/timer-started'))).toBe(false);
    expect(service.getSnapshot().competitions[0]?.activeTimer).toBeUndefined();
    await service.disconnect();
  });

  it('does not publish the previous expiry while a restarted timer is only partly applied', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-28T00:00:00.000Z'));
    const service = createService(transport);
    await service.connect('mqtt://localhost:1883');
    const created = await createCompetitionGroup(service, COMPETITION_ID, 'BR60S', [LANE_ID, SECOND_LANE_ID]);
    const originalTimerStartAt = new Date().toISOString();
    transport.emitMessage(`saika/competition/${COMPETITION_ID}/state`, {
      ...created,
      phase: 'MATCH',
      startedAt: originalTimerStartAt,
      activeTimer: {
        timerScope: 'STAGE',
        timerStartAt: originalTimerStartAt,
        timerDurationSeconds: 1,
        stageIndex: 1,
        seriesIndex: null,
      },
      publishedAt: originalTimerStartAt,
    });

    const restart = service.restartTimer(COMPETITION_ID, 'STAGE', 60, 1, null);
    await vi.advanceTimersByTimeAsync(0);
    const restartPublication = transport.publications.find((entry) => entry.topic.endsWith('/timer-started'))!;
    const restartCommand = JSON.parse(restartPublication.payload) as { commandId: string; timerStartAt: string };
    transport.emitMessage(`saika/competition/${COMPETITION_ID}/command/timer-started/acknowledgement/${LANE_ID}`, {
      commandId: restartCommand.commandId,
      laneId: LANE_ID,
      status: 'done',
      acknowledgedAt: new Date().toISOString(),
    });
    await vi.advanceTimersByTimeAsync(50);

    await expect(restart).resolves.toMatchObject({ success: false });
    expect(service.getSnapshot().competitions[0]).toMatchObject({
      activeTimer: { timerStartAt: originalTimerStartAt, timerDurationSeconds: 1 },
      pendingTimer: {
        action: 'timer-started',
        timerStartAt: restartCommand.timerStartAt,
        timerDurationSeconds: 60,
      },
    });

    await vi.advanceTimersByTimeAsync(950);
    expect(transport.publications.filter((entry) => entry.topic.endsWith('/timer-expired'))).toHaveLength(0);

    const retry = service.restartTimer(COMPETITION_ID, 'STAGE', 60, 1, null);
    await vi.advanceTimersByTimeAsync(0);
    const retryPublication = transport.publications.filter((entry) => entry.topic.endsWith('/timer-started')).at(-1)!;
    const retryCommand = JSON.parse(retryPublication.payload) as { commandId: string; timerStartAt: string };
    expect(retryCommand.timerStartAt).toBe(restartCommand.timerStartAt);
    for (const laneId of [LANE_ID, SECOND_LANE_ID]) {
      transport.emitMessage(`saika/competition/${COMPETITION_ID}/command/timer-started/acknowledgement/${laneId}`, {
        commandId: retryCommand.commandId,
        laneId,
        status: 'done',
        acknowledgedAt: new Date().toISOString(),
      });
    }
    await expect(retry).resolves.toMatchObject({ success: true });

    await vi.advanceTimersByTimeAsync(59_000);
    expect(transport.publications.filter((entry) => entry.topic.endsWith('/timer-expired'))).toHaveLength(1);
    await service.disconnect();
  });

  it('locks membership after start while allowing a pending sighting Lane to leave', async () => {
    const service = createService(transport);
    await service.connect('mqtt://localhost:1883');
    const created = await service.createCompetition({
      competitionId: COMPETITION_ID,
      competitionTypeId: 'BR60S',
      competitionTypeName: '10m Beam Rifle 60 shots standing',
      discipline: 'BEAM_RIFLE_10M',
      roundName: 'Qualification',
      acc: 'DECIMAL',
      shotsPerSeries: 10,
      totalSeries: 6,
      totalShots: 60,
      laneIds: [LANE_ID, SECOND_LANE_ID],
    });
    transport.emitMessage(`saika/competition/${COMPETITION_ID}/state`, {
      ...created,
      phase: 'SIGHTING',
      startedAt: new Date().toISOString(),
      pendingSightingLaneIds: [SECOND_LANE_ID],
      publishedAt: new Date(Date.now() + 1).toISOString(),
    });

    await expect(service.joinCompetition(COMPETITION_ID, [THIRD_LANE_ID])).rejects.toThrow('Cannot join competition');
    await expect(service.leaveCompetition(COMPETITION_ID, [LANE_ID])).rejects.toThrow(
      'only Lanes still pending sighting may leave',
    );
    expect(transport.publications.some((entry) => entry.topic.endsWith('/leave-competition'))).toBe(false);

    const leavePromise = service.leaveCompetition(COMPETITION_ID, [SECOND_LANE_ID]);
    await vi.waitFor(() =>
      expect(transport.publications.some((entry) => entry.topic.endsWith('/leave-competition'))).toBe(true),
    );
    const leavePublication = transport.publications.find((entry) => entry.topic.endsWith('/leave-competition'))!;
    const leaveCommand = JSON.parse(leavePublication.payload) as { commandId: string };
    transport.emitMessage(`saika/lane/${SECOND_LANE_ID}/command/leave-competition/acknowledgement`, {
      commandId: leaveCommand.commandId,
      laneId: SECOND_LANE_ID,
      status: 'done',
      acknowledgedAt: new Date().toISOString(),
    });

    await expect(leavePromise).resolves.toMatchObject({
      success: true,
      commands: [{ success: true, lanes: [{ laneId: SECOND_LANE_ID, status: 'done' }] }],
    });
    expect(service.getSnapshot().competitions[0]).toMatchObject({
      phase: 'SIGHTING',
      laneIds: [LANE_ID],
    });
    expect(service.getSnapshot().competitions[0]?.pendingSightingLaneIds).toBeUndefined();
    await service.disconnect();
  });

  it('allows session reset before start and rejects it after competition start', async () => {
    const service = createService(transport);
    await service.connect('mqtt://localhost:1883');
    const created = await createCompetition(service);

    const resetPromise = service.resetSession(COMPETITION_ID, LANE_ID, 'pre-competition cleanup');
    await vi.waitFor(() =>
      expect(transport.publications.some((entry) => entry.topic.endsWith('/reset-session'))).toBe(true),
    );
    const resetPublication = transport.publications.find((entry) => entry.topic.endsWith('/reset-session'))!;
    const resetCommand = JSON.parse(resetPublication.payload) as { commandId: string };
    transport.emitMessage(`saika/competition/${COMPETITION_ID}/lane/${LANE_ID}/command/reset-session/acknowledgement`, {
      commandId: resetCommand.commandId,
      laneId: LANE_ID,
      status: 'done',
      acknowledgedAt: new Date().toISOString(),
    });
    await expect(resetPromise).resolves.toMatchObject({ success: true });

    transport.emitMessage(`saika/competition/${COMPETITION_ID}/state`, {
      ...created,
      phase: 'SIGHTING',
      startedAt: new Date().toISOString(),
      publishedAt: new Date(Date.now() + 1).toISOString(),
    });
    const resetPublicationCount = transport.publications.filter((entry) =>
      entry.topic.endsWith('/reset-session'),
    ).length;

    await expect(service.resetSession(COMPETITION_ID, LANE_ID)).rejects.toThrow('Cannot reset a session');
    expect(transport.publications.filter((entry) => entry.topic.endsWith('/reset-session'))).toHaveLength(
      resetPublicationCount,
    );
    await service.disconnect();
  });

  it('locks athlete assignments during competition but permits repair before result cleanup', async () => {
    const service = createService(transport);
    await service.connect('mqtt://localhost:1883');
    const created = await createCompetition(service);
    const athlete = {
      startNumber: 1,
      id: PARTICIPANT_ID,
      name: 'Test Athlete',
    };

    const assignAndAcknowledge = async () => {
      const publicationCount = transport.publications.filter((entry) =>
        entry.topic.endsWith('/command/assign-athlete'),
      ).length;
      const resultPromise = service.assignAthlete(COMPETITION_ID, LANE_ID, athlete);
      await vi.waitFor(() =>
        expect(transport.publications.filter((entry) => entry.topic.endsWith('/command/assign-athlete'))).toHaveLength(
          publicationCount + 1,
        ),
      );
      const publication = transport.publications
        .filter((entry) => entry.topic.endsWith('/command/assign-athlete'))
        .at(-1)!;
      const command = JSON.parse(publication.payload) as { commandId: string };
      transport.emitMessage(
        `saika/competition/${COMPETITION_ID}/lane/${LANE_ID}/command/assign-athlete/acknowledgement`,
        {
          commandId: command.commandId,
          laneId: LANE_ID,
          status: 'done',
          acknowledgedAt: new Date().toISOString(),
        },
      );
      return resultPromise;
    };

    await expect(assignAndAcknowledge()).resolves.toMatchObject({ success: true });

    transport.emitMessage(`saika/competition/${COMPETITION_ID}/state`, {
      ...created,
      phase: 'SIGHTING',
      startedAt: new Date().toISOString(),
      publishedAt: new Date(Date.now() + 1).toISOString(),
    });
    const activePublicationCount = transport.publications.filter((entry) =>
      entry.topic.endsWith('/command/assign-athlete'),
    ).length;
    await expect(service.assignAthlete(COMPETITION_ID, LANE_ID, athlete)).rejects.toThrow(
      'Cannot change athlete assignments',
    );
    expect(transport.publications.filter((entry) => entry.topic.endsWith('/command/assign-athlete'))).toHaveLength(
      activePublicationCount,
    );

    const finishedAt = new Date().toISOString();
    transport.emitMessage(`saika/competition/${COMPETITION_ID}/state`, {
      ...created,
      phase: 'MATCH_COMPLETE',
      startedAt: created.startedAt ?? finishedAt,
      finishedAt,
      publishedAt: new Date(Date.now() + 2).toISOString(),
    });
    await expect(assignAndAcknowledge()).resolves.toMatchObject({ success: true });

    transport.emitMessage(`saika/competition/${COMPETITION_ID}/state`, {
      ...created,
      phase: 'MATCH_COMPLETE',
      startedAt: created.startedAt ?? finishedAt,
      finishedAt,
      cleanupPreparedAt: new Date().toISOString(),
      publishedAt: new Date(Date.now() + 3).toISOString(),
    });
    const cleanupPublicationCount = transport.publications.filter((entry) =>
      entry.topic.endsWith('/command/assign-athlete'),
    ).length;
    await expect(service.assignAthlete(COMPETITION_ID, LANE_ID, athlete)).rejects.toThrow(
      'Cannot change athlete assignments',
    );
    expect(transport.publications.filter((entry) => entry.topic.endsWith('/command/assign-athlete'))).toHaveLength(
      cleanupPublicationCount,
    );
    await service.disconnect();
  });

  it('discards pre-reset competition shots after a successful session reset', async () => {
    const service = createService(transport);
    await service.connect('mqtt://localhost:1883');
    await createCompetition(service);
    transport.emitMessage(`saika/competition/${COMPETITION_ID}/lane/${LANE_ID}/shot`, {
      laneId: LANE_ID,
      shotId: '77777777-7777-4777-8777-777777777777',
      x: 0,
      y: 0,
      rawScoreX10: 105,
      innerTen: false,
      mode: 'MATCH',
      timestamp: new Date().toISOString(),
      competitionId: COMPETITION_ID,
      sessionId: SESSION_ID,
      stageIndex: 1,
      scored: true,
      seriesIndex: 0,
      shotNumberInSeries: 1,
      isRecorded: true,
      isReplay: false,
      publishedAt: new Date().toISOString(),
    });

    const reset = service.resetSession(COMPETITION_ID, LANE_ID);
    await vi.waitFor(() =>
      expect(transport.publications.some((entry) => entry.topic.endsWith('/reset-session'))).toBe(true),
    );
    const resetCommand = JSON.parse(
      transport.publications.find((entry) => entry.topic.endsWith('/reset-session'))!.payload,
    ) as { commandId: string };
    transport.emitMessage(`saika/competition/${COMPETITION_ID}/lane/${LANE_ID}/command/reset-session/acknowledgement`, {
      commandId: resetCommand.commandId,
      laneId: LANE_ID,
      status: 'done',
      acknowledgedAt: new Date().toISOString(),
    });
    await expect(reset).resolves.toMatchObject({ success: true });
    expect(service.getSnapshot().lanes[0]?.lastCompetitionShot).toBeNull();

    const beforeCleanup = vi.fn().mockResolvedValue(false);
    const finishing = service.finishCompetition(COMPETITION_ID, beforeCleanup);
    await vi.waitFor(() =>
      expect(transport.publications.some((entry) => entry.topic.endsWith('/finish-competition'))).toBe(true),
    );
    const finishCommand = JSON.parse(
      transport.publications.find((entry) => entry.topic.endsWith('/finish-competition'))!.payload,
    ) as { commandId: string };
    transport.emitMessage(`saika/competition/${COMPETITION_ID}/command/finish-competition/acknowledgement/${LANE_ID}`, {
      commandId: finishCommand.commandId,
      laneId: LANE_ID,
      status: 'done',
      acknowledgedAt: new Date().toISOString(),
    });
    emitFinalLaneSnapshots(transport, finishCommand.commandId);

    await expect(finishing).resolves.toMatchObject({ success: true });
    expect(beforeCleanup).toHaveBeenCalledWith([expect.objectContaining({ laneId: LANE_ID, shots: [] })]);
  });

  it('marks a lane as timed out when no terminal ACK arrives', async () => {
    const service = createService(transport);
    await service.connect('mqtt://localhost:1883');
    const state = await createCompetition(service);
    transport.emitMessage(`saika/competition/${COMPETITION_ID}/state`, {
      ...state,
      phase: 'SIGHTING',
      startedAt: new Date().toISOString(),
      publishedAt: new Date(Date.now() + 1).toISOString(),
    });

    await expect(service.endSighting(COMPETITION_ID)).resolves.toMatchObject({
      success: false,
      lanes: [{ laneId: LANE_ID, status: 'timeout' }],
    });
  });

  it('returns the command timeout while a QoS publish is still awaiting acknowledgement', async () => {
    vi.useFakeTimers();
    const service = createService(transport);
    await service.connect('mqtt://localhost:1883');
    await createCompetition(service);

    let releasePublish!: () => void;
    const publishBarrier = new Promise<void>((resolve) => {
      releasePublish = resolve;
    });
    transport.publishBarrierForTopic = (topic) => (topic.endsWith('/assign-athlete') ? publishBarrier : null);

    let observedResult: Awaited<ReturnType<DirectorMqttService['assignAthlete']>> | undefined;
    const command = service.assignAthlete(COMPETITION_ID, LANE_ID, null).then((result) => {
      observedResult = result;
      return result;
    });
    await vi.advanceTimersByTimeAsync(50);
    const resultBeforePublishSettled = observedResult;

    releasePublish();
    await command;

    expect(resultBeforePublishSettled).toMatchObject({
      success: false,
      lanes: [{ laneId: LANE_ID, status: 'timeout' }],
    });
  });

  it('deduplicates replayed competition shots by shotId', async () => {
    const onCompetitionShot = vi.fn();
    const onCompetitionShotObserved = vi.fn();
    const service = new DirectorMqttService(
      { directorId: 'director-test' },
      { onCompetitionShot, onCompetitionShotObserved },
      transport,
    );
    await service.connect('mqtt://localhost:1883');
    await createCompetition(service);
    const shot = {
      laneId: LANE_ID,
      shotId: '33333333-3333-4333-8333-333333333333',
      x: 0,
      y: 0,
      rawScoreX10: 109,
      innerTen: true,
      mode: 'MATCH',
      timestamp: new Date().toISOString(),
      competitionId: COMPETITION_ID,
      sessionId: '44444444-4444-4444-8444-444444444444',
      stageIndex: 1,
      scored: true,
      seriesIndex: 0,
      shotNumberInSeries: 1,
      isRecorded: true,
      isReplay: true,
      publishedAt: new Date().toISOString(),
    };
    const topic = `saika/competition/${COMPETITION_ID}/lane/${LANE_ID}/shot`;

    transport.emitMessage(topic, shot);
    transport.emitMessage(topic, shot);

    expect(onCompetitionShot).toHaveBeenCalledTimes(1);
    expect(onCompetitionShotObserved).toHaveBeenCalledTimes(2);
    expect(JSON.parse(onCompetitionShotObserved.mock.calls[0]![1] as string)).toEqual(shot);
    expect(service.getSnapshot().lanes[0]?.lastCompetitionShot?.shotId).toBe(shot.shotId);
  });

  it('clears lane retained state without reporting an invalid payload', async () => {
    const onError = vi.fn();
    const service = new DirectorMqttService({ directorId: 'director-test' }, { onError }, transport);
    await service.connect('mqtt://localhost:1883');
    await createCompetition(service);
    transport.emitMessage(`saika/lane/${LANE_ID}/hardware/state`, hardwareState());
    transport.emitMessage(`saika/competition/${COMPETITION_ID}/lane/${LANE_ID}/assignment`, {
      competitionId: COMPETITION_ID,
      laneId: LANE_ID,
      athlete: { startNumber: 1, id: 'athlete-1', name: 'Athlete' },
      assignedAt: new Date().toISOString(),
      publishedAt: new Date().toISOString(),
    });
    expect(service.getSnapshot().lanes[0]?.assignment).not.toBeNull();

    transport.emitRawMessage(`saika/competition/${COMPETITION_ID}/lane/${LANE_ID}/assignment`, Buffer.alloc(0));

    expect(service.getSnapshot().lanes[0]?.assignment).toBeNull();
    expect(onError).not.toHaveBeenCalled();
  });

  it('does not restore stale lane data after a competition retained state is cleared', async () => {
    const service = createService(transport);
    await service.connect('mqtt://localhost:1883');
    await createCompetition(service);
    transport.emitMessage(`saika/competition/${COMPETITION_ID}/lane/${LANE_ID}/assignment`, {
      competitionId: COMPETITION_ID,
      laneId: LANE_ID,
      athlete: { startNumber: 1, id: PARTICIPANT_ID, name: 'Old Athlete' },
      assignedAt: '2026-08-26T00:00:00.000Z',
      publishedAt: '2026-08-26T00:00:00.000Z',
    });
    const statePublication = transport.publications.find(
      (entry) => entry.topic === `saika/competition/${COMPETITION_ID}/state`,
    )!;

    transport.emitRawMessage(statePublication.topic, Buffer.alloc(0));
    transport.emitRawMessage(statePublication.topic, Buffer.from(statePublication.payload));

    expect(service.getSnapshot()).toMatchObject({
      activeCompetitionId: COMPETITION_ID,
      lanes: [expect.objectContaining({ laneId: LANE_ID, assignment: null })],
    });
  });

  it('keeps retained lane data isolated by competition', async () => {
    const oldCompetitionId = '66666666-6666-4666-8666-666666666666';
    const service = createService(transport);
    await service.connect('mqtt://localhost:1883');
    await createCompetition(service);
    transport.emitMessage(`saika/competition/${COMPETITION_ID}/lane/${LANE_ID}/assignment`, {
      competitionId: COMPETITION_ID,
      laneId: LANE_ID,
      athlete: { startNumber: 1, id: PARTICIPANT_ID, name: 'Current Athlete' },
      assignedAt: '2026-08-26T00:00:00.000Z',
      publishedAt: '2026-08-26T00:00:00.000Z',
    });
    transport.emitMessage(`saika/competition/${oldCompetitionId}/state`, {
      competitionId: oldCompetitionId,
      competitionTypeId: 'BR60S',
      competitionTypeName: '10m Beam Rifle 60 shots standing',
      discipline: 'BEAM_RIFLE_10M',
      roundName: 'Qualification',
      acc: 'DECIMAL',
      shotsPerSeries: 10,
      totalSeries: 6,
      totalShots: 60,
      laneIds: [LANE_ID],
      phase: 'NOT_STARTED',
      startedAt: null,
      finishedAt: null,
      publishedAt: '2020-01-01T00:00:00.000Z',
    });
    transport.emitMessage(`saika/competition/${oldCompetitionId}/lane/${LANE_ID}/assignment`, {
      competitionId: oldCompetitionId,
      laneId: LANE_ID,
      athlete: {
        startNumber: 99,
        id: '77777777-7777-4777-8777-777777777777',
        name: 'Old Athlete',
      },
      assignedAt: '2020-01-01T00:00:00.000Z',
      publishedAt: '2020-01-01T00:00:00.000Z',
    });

    expect(service.getSnapshot()).toMatchObject({
      activeCompetitionId: COMPETITION_ID,
      lanes: [{ assignment: { athlete: { id: PARTICIPANT_ID, name: 'Current Athlete' } } }],
    });

    transport.emitRawMessage(`saika/competition/${COMPETITION_ID}/state`, Buffer.alloc(0));

    expect(service.getSnapshot()).toMatchObject({
      activeCompetitionId: oldCompetitionId,
      competitions: [expect.objectContaining({ competitionId: oldCompetitionId })],
      lanes: [
        {
          assignment: {
            athlete: { id: '77777777-7777-4777-8777-777777777777', name: 'Old Athlete' },
          },
        },
      ],
    });
  });

  it('projects each Lane from the competition that owns it', async () => {
    const service = createService(transport);
    await service.connect('mqtt://localhost:1883');
    transport.emitMessage(`saika/lane/${LANE_ID}/hardware/state`, hardwareState());
    transport.emitMessage(`saika/lane/${SECOND_LANE_ID}/hardware/state`, {
      ...hardwareState(),
      laneId: SECOND_LANE_ID,
      laneAlias: 'Lane 5',
    });
    await createCompetitionGroup(service, COMPETITION_ID, 'BP60', [LANE_ID]);
    await createCompetitionGroup(service, SECOND_COMPETITION_ID, 'BR60S', [SECOND_LANE_ID]);

    transport.emitMessage(`saika/competition/${COMPETITION_ID}/lane/${LANE_ID}/assignment`, {
      competitionId: COMPETITION_ID,
      laneId: LANE_ID,
      athlete: { startNumber: 1, id: 'bp-athlete', name: 'Pistol Athlete' },
      assignedAt: '2026-08-26T00:00:00.000Z',
      publishedAt: '2026-08-26T00:00:00.000Z',
    });
    transport.emitMessage(`saika/competition/${SECOND_COMPETITION_ID}/lane/${SECOND_LANE_ID}/assignment`, {
      competitionId: SECOND_COMPETITION_ID,
      laneId: SECOND_LANE_ID,
      athlete: { startNumber: 5, id: 'br-athlete', name: 'Rifle Athlete' },
      assignedAt: '2026-08-26T00:00:00.000Z',
      publishedAt: '2026-08-26T00:00:01.000Z',
    });

    expect(service.getSnapshot().lanes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          laneId: LANE_ID,
          assignment: expect.objectContaining({
            competitionId: COMPETITION_ID,
            athlete: expect.objectContaining({ id: 'bp-athlete' }),
          }),
        }),
        expect.objectContaining({
          laneId: SECOND_LANE_ID,
          assignment: expect.objectContaining({
            competitionId: SECOND_COMPETITION_ID,
            athlete: expect.objectContaining({ id: 'br-athlete' }),
          }),
        }),
      ]),
    );
  });

  it('rejects joining a Lane that belongs to another competition', async () => {
    const service = createService(transport);
    await service.connect('mqtt://localhost:1883');
    await createCompetitionGroup(service, COMPETITION_ID, 'BP60', [LANE_ID]);
    await createCompetitionGroup(service, SECOND_COMPETITION_ID, 'BR60S', [SECOND_LANE_ID]);
    const publicationCount = transport.publications.length;

    await expect(service.joinCompetition(SECOND_COMPETITION_ID, [LANE_ID])).rejects.toThrow(
      `Lane ${LANE_ID} is already joined to competition ${COMPETITION_ID} (BP60)`,
    );
    expect(transport.publications).toHaveLength(publicationCount);
  });

  it('keeps independent expiry timers for simultaneous competitions', async () => {
    vi.useFakeTimers();
    const service = createService(transport);
    await service.connect('mqtt://localhost:1883');
    await createCompetitionGroup(service, COMPETITION_ID, 'BP60', [LANE_ID]);
    await createCompetitionGroup(service, SECOND_COMPETITION_ID, 'BR60S', [SECOND_LANE_ID]);

    const startAndAcknowledge = async (competitionId: string, laneId: string) => {
      const starting = service.startSighting(competitionId, 1);
      await vi.advanceTimersByTimeAsync(0);
      const publication = transport.publications.find(
        (entry) => entry.topic === `saika/competition/${competitionId}/command/start-sighting`,
      )!;
      const command = JSON.parse(publication.payload) as { commandId: string };
      transport.emitMessage(`saika/competition/${competitionId}/command/start-sighting/acknowledgement/${laneId}`, {
        commandId: command.commandId,
        laneId,
        status: 'done',
        acknowledgedAt: new Date().toISOString(),
      });
      await starting;
    };

    await startAndAcknowledge(COMPETITION_ID, LANE_ID);
    await startAndAcknowledge(SECOND_COMPETITION_ID, SECOND_LANE_ID);
    await vi.advanceTimersByTimeAsync(1_000);

    expect(
      transport.publications
        .filter((entry) => entry.topic.endsWith('/command/timer-expired'))
        .map((entry) => entry.topic),
    ).toEqual(
      expect.arrayContaining([
        `saika/competition/${COMPETITION_ID}/command/timer-expired`,
        `saika/competition/${SECOND_COMPETITION_ID}/command/timer-expired`,
      ]),
    );
    await service.disconnect();
  });

  it('restores a retained competition timer and publishes its original expiry after restart', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-28T00:00:00.000Z'));
    const service = createService(transport);
    await service.connect('mqtt://localhost:1883');
    const timerStartAt = new Date().toISOString();

    transport.emitMessage(`saika/competition/${COMPETITION_ID}/state`, {
      competitionId: COMPETITION_ID,
      competitionTypeId: 'BR60S',
      competitionTypeName: '10m Beam Rifle 60 shots standing',
      discipline: 'BEAM_RIFLE_10M',
      roundName: 'Qualification',
      acc: 'DECIMAL',
      phase: 'MATCH',
      shotsPerSeries: 10,
      totalSeries: 6,
      totalShots: 60,
      laneIds: [LANE_ID],
      startedAt: timerStartAt,
      finishedAt: null,
      activeTimer: {
        timerScope: 'STAGE',
        timerStartAt,
        timerDurationSeconds: 30,
        stageIndex: 1,
        seriesIndex: null,
      },
      publishedAt: timerStartAt,
    });

    await vi.advanceTimersByTimeAsync(30_000);

    const expiryPublication = transport.publications.find((entry) => entry.topic.endsWith('/command/timer-expired'))!;
    const expiryCommand = JSON.parse(expiryPublication.payload) as { commandId: string; expiredAt: string };
    expect(expiryCommand.expiredAt).toBe('2026-08-28T00:00:30.000Z');

    transport.emitMessage(`saika/competition/${COMPETITION_ID}/command/timer-expired/acknowledgement/${LANE_ID}`, {
      commandId: expiryCommand.commandId,
      laneId: LANE_ID,
      status: 'done',
      acknowledgedAt: new Date().toISOString(),
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(service.getSnapshot().competitions[0]?.activeTimer).toBeUndefined();
    await service.disconnect();
  });

  it('retries an expired timer when clearing its retained state fails', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-28T00:00:00.000Z'));
    const service = createService(transport);
    await service.connect('mqtt://localhost:1883');
    const timerStartAt = new Date().toISOString();

    transport.emitMessage(`saika/competition/${COMPETITION_ID}/state`, {
      competitionId: COMPETITION_ID,
      competitionTypeId: 'BR60S',
      competitionTypeName: '10m Beam Rifle 60 shots standing',
      discipline: 'BEAM_RIFLE_10M',
      roundName: 'Qualification',
      acc: 'DECIMAL',
      phase: 'MATCH',
      shotsPerSeries: 10,
      totalSeries: 6,
      totalShots: 60,
      laneIds: [LANE_ID],
      startedAt: timerStartAt,
      finishedAt: null,
      activeTimer: {
        timerScope: 'STAGE',
        timerStartAt,
        timerDurationSeconds: 30,
        stageIndex: 1,
        seriesIndex: null,
      },
      publishedAt: timerStartAt,
    });

    await vi.advanceTimersByTimeAsync(30_000);
    const firstPublication = transport.publications.find((entry) => entry.topic.endsWith('/command/timer-expired'))!;
    const firstCommand = JSON.parse(firstPublication.payload) as { commandId: string };
    transport.publishErrorForTopic = (topic) =>
      topic === `saika/competition/${COMPETITION_ID}/state` ? new Error('retained state unavailable') : null;
    transport.emitMessage(`saika/competition/${COMPETITION_ID}/command/timer-expired/acknowledgement/${LANE_ID}`, {
      commandId: firstCommand.commandId,
      laneId: LANE_ID,
      status: 'done',
      acknowledgedAt: new Date().toISOString(),
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(service.getSnapshot().competitions[0]?.activeTimer).toBeDefined();
    transport.publishErrorForTopic = null;
    await vi.advanceTimersByTimeAsync(1_000);

    const expiryPublications = transport.publications.filter((entry) => entry.topic.endsWith('/command/timer-expired'));
    expect(expiryPublications).toHaveLength(2);
    const retryCommand = JSON.parse(expiryPublications[1]!.payload) as { commandId: string };
    transport.emitMessage(`saika/competition/${COMPETITION_ID}/command/timer-expired/acknowledgement/${LANE_ID}`, {
      commandId: retryCommand.commandId,
      laneId: LANE_ID,
      status: 'done',
      acknowledgedAt: new Date().toISOString(),
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(service.getSnapshot().competitions[0]?.activeTimer).toBeUndefined();
    await service.disconnect();
  });

  it('keeps an expired retained timer until an offline Lane reconnects and acknowledges it', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-28T00:01:00.000Z'));
    const service = createService(transport);
    await service.connect('mqtt://localhost:1883');

    transport.emitMessage(`saika/competition/${COMPETITION_ID}/state`, {
      competitionId: COMPETITION_ID,
      competitionTypeId: 'BR60S',
      competitionTypeName: '10m Beam Rifle 60 shots standing',
      discipline: 'BEAM_RIFLE_10M',
      roundName: 'Qualification',
      acc: 'DECIMAL',
      phase: 'MATCH',
      shotsPerSeries: 10,
      totalSeries: 6,
      totalShots: 60,
      laneIds: [LANE_ID],
      startedAt: '2026-08-28T00:00:00.000Z',
      finishedAt: null,
      activeTimer: {
        timerScope: 'STAGE',
        timerStartAt: '2026-08-28T00:00:00.000Z',
        timerDurationSeconds: 30,
        stageIndex: 1,
        seriesIndex: null,
      },
      publishedAt: '2026-08-28T00:00:00.000Z',
    });

    await vi.advanceTimersByTimeAsync(50);
    expect(transport.publications.filter((entry) => entry.topic.endsWith('/command/timer-expired'))).toHaveLength(1);
    expect(service.getSnapshot().competitions[0]?.activeTimer).toBeDefined();

    transport.emitMessage(`saika/lane/${LANE_ID}/hardware/state`, hardwareState());
    await vi.advanceTimersByTimeAsync(0);
    const expiryPublications = transport.publications.filter((entry) => entry.topic.endsWith('/command/timer-expired'));
    expect(expiryPublications).toHaveLength(2);
    const retriedCommand = JSON.parse(expiryPublications[1]!.payload) as { commandId: string; expiredAt: string };
    expect(retriedCommand.expiredAt).toBe('2026-08-28T00:00:30.000Z');

    transport.emitMessage(`saika/competition/${COMPETITION_ID}/command/timer-expired/acknowledgement/${LANE_ID}`, {
      commandId: retriedCommand.commandId,
      laneId: LANE_ID,
      status: 'done',
      acknowledgedAt: new Date().toISOString(),
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(service.getSnapshot().competitions[0]?.activeTimer).toBeUndefined();
    await service.disconnect();
  });

  it('clears broker-scoped state before connecting to another broker', async () => {
    const onSessionReset = vi.fn();
    const service = new DirectorMqttService({ directorId: 'director-test' }, { onSessionReset }, transport);
    await service.connect('mqtt://broker-a:1883');
    transport.emitMessage(`saika/lane/${LANE_ID}/hardware/state`, hardwareState());
    await createCompetition(service);

    await service.disconnect();
    await service.connect('mqtt://broker-b:1883');

    expect(service.getSnapshot()).toMatchObject({
      brokerUrl: 'mqtt://broker-b:1883',
      activeCompetitionId: null,
      lanes: [],
      competitions: [],
      lastCommand: null,
    });
    expect(onSessionReset).toHaveBeenCalledTimes(2);
  });

  it('rebuilds broker-scoped state after an automatic reconnect', async () => {
    const service = createService(transport);
    await service.connect('mqtt://localhost:1883');
    transport.emitMessage(`saika/lane/${LANE_ID}/hardware/state`, hardwareState());
    await createCompetition(service);

    transport.emitDisconnected();
    transport.emitConnected();

    await vi.waitFor(() => expect(transport.subscriptions).toHaveLength(6));
    expect(service.getSnapshot()).toMatchObject({
      connected: true,
      activeCompetitionId: null,
      lanes: [],
      competitions: [],
    });
  });

  it('does not report an automatic reconnect as ready before subscriptions finish', async () => {
    const service = createService(transport);
    await service.connect('mqtt://localhost:1883');
    transport.emitDisconnected();

    let releaseSubscriptions!: () => void;
    transport.subscribeBarrier = new Promise<void>((resolve) => {
      releaseSubscriptions = resolve;
    });
    transport.emitConnected();

    expect(service.getSnapshot().connected).toBe(false);

    releaseSubscriptions();
    await vi.waitFor(() => expect(service.getSnapshot().connected).toBe(true));
  });

  it('stays unready and retries when automatic reconnect subscriptions fail', async () => {
    const onError = vi.fn();
    const service = new DirectorMqttService(
      { directorId: 'director-test', commandTimeoutMs: 50, startDelayMs: 0, resubscribeRetryMs: 100 },
      { onError },
      transport,
    );
    await service.connect('mqtt://localhost:1883');
    transport.emitDisconnected();
    transport.subscribeError = new Error('resubscription rejected');

    transport.emitConnected();

    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith('resubscription rejected'));
    expect(service.getSnapshot().connected).toBe(false);

    transport.subscribeError = null;
    await vi.waitFor(() => expect(service.getSnapshot().connected).toBe(true));
  });

  it('retains provisional membership when a join publish outcome is ambiguous', async () => {
    const service = createService(transport);
    await service.connect('mqtt://localhost:1883');
    await createCompetitionGroup(service, COMPETITION_ID, 'BR60S', []);
    transport.publishErrorForTopic = (topic) =>
      topic.endsWith('/join-competition') ? new Error('socket closed') : null;

    await expect(service.joinCompetition(COMPETITION_ID, [LANE_ID])).resolves.toMatchObject({
      success: false,
      commands: [
        {
          success: false,
          lanes: [
            {
              laneId: LANE_ID,
              status: 'error',
              error: { code: 'MQTT_PUBLISH_FAILED', message: 'socket closed' },
            },
          ],
        },
      ],
    });

    expect(service.getSnapshot().competitions[0]).toMatchObject({
      laneIds: [LANE_ID],
      pendingJoinLaneIds: [LANE_ID],
    });
    const finalState = JSON.parse(
      transport.publications.filter((entry) => entry.topic === `saika/competition/${COMPETITION_ID}/state`).at(-1)!
        .payload,
    ) as { laneIds: string[]; pendingJoinLaneIds?: string[] };
    expect(finalState).toMatchObject({ laneIds: [LANE_ID], pendingJoinLaneIds: [LANE_ID] });

    const leaving = service.leaveCompetition(COMPETITION_ID, [LANE_ID]);
    await vi.waitFor(() =>
      expect(transport.publications.filter((entry) => entry.topic.endsWith('/leave-competition'))).toHaveLength(1),
    );
    const leavePublication = transport.publications.find((entry) => entry.topic.endsWith('/leave-competition'))!;
    const leaveCommand = JSON.parse(leavePublication.payload) as { commandId: string };
    transport.emitMessage(`saika/lane/${LANE_ID}/command/leave-competition/acknowledgement`, {
      commandId: leaveCommand.commandId,
      laneId: LANE_ID,
      status: 'error',
      error: { code: 'MQTT_NOT_IN_COMPETITION', message: 'Lane did not receive the join command' },
      acknowledgedAt: new Date().toISOString(),
    });

    await expect(leaving).resolves.toMatchObject({
      success: true,
      commands: [{ lanes: [{ laneId: LANE_ID, status: 'done' }] }],
    });
    expect(service.getSnapshot().competitions[0]).toMatchObject({ laneIds: [] });
    expect(service.getSnapshot().competitions[0]?.pendingJoinLaneIds).toBeUndefined();
  });

  it('captures final MQTT result data before clearing retained competition topics', async () => {
    const service = createService(transport);
    await service.connect('mqtt://localhost:1883');
    await createCompetition(service);
    transport.emitMessage(`saika/competition/${COMPETITION_ID}/lane/${LANE_ID}/assignment`, {
      competitionId: COMPETITION_ID,
      laneId: LANE_ID,
      athlete: { startNumber: 1, id: PARTICIPANT_ID, name: 'Athlete', teamName: 'Team' },
      assignedAt: new Date().toISOString(),
      publishedAt: new Date().toISOString(),
    });
    transport.emitMessage(`saika/competition/${COMPETITION_ID}/lane/${LANE_ID}/score`, {
      competitionId: COMPETITION_ID,
      laneId: LANE_ID,
      sessionId: SESSION_ID,
      totalScoreX10: 105,
      totalShotCount: 1,
      acc: 'DECIMAL',
      stages: [
        {
          stageIndex: 1,
          stageName: 'Match',
          stageTotalX10: 105,
          series: [{ seriesIndex: 0, shots: [105], seriesTotalX10: 105, isComplete: false }],
        },
      ],
      publishedAt: new Date().toISOString(),
    });
    transport.emitMessage(`saika/competition/${COMPETITION_ID}/lane/${LANE_ID}/shot`, {
      laneId: LANE_ID,
      shotId: '55555555-5555-4555-8555-555555555555',
      x: 0,
      y: 0,
      rawScoreX10: 105,
      innerTen: false,
      mode: 'MATCH',
      timestamp: new Date().toISOString(),
      competitionId: COMPETITION_ID,
      sessionId: SESSION_ID,
      stageIndex: 1,
      scored: true,
      seriesIndex: 0,
      shotNumberInSeries: 1,
      isRecorded: true,
      isReplay: false,
      publishedAt: new Date().toISOString(),
    });
    const beforeCleanup = vi.fn().mockResolvedValue(true);

    const finishing = service.finishCompetition(COMPETITION_ID, beforeCleanup);
    await vi.waitFor(() =>
      expect(transport.publications.some((entry) => entry.topic.endsWith('/finish-competition'))).toBe(true),
    );
    const commandPublication = transport.publications.find((entry) => entry.topic.endsWith('/finish-competition'))!;
    const command = JSON.parse(commandPublication.payload) as { commandId: string };
    transport.emitMessage(`saika/competition/${COMPETITION_ID}/command/finish-competition/acknowledgement/${LANE_ID}`, {
      commandId: command.commandId,
      laneId: LANE_ID,
      status: 'done',
      acknowledgedAt: new Date().toISOString(),
    });

    await Promise.resolve();
    expect(beforeCleanup).not.toHaveBeenCalled();
    transport.emitMessage(`saika/competition/${COMPETITION_ID}/lane/${LANE_ID}/state`, finalLaneState());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(beforeCleanup).not.toHaveBeenCalled();
    transport.emitMessage(`saika/competition/${COMPETITION_ID}/lane/${LANE_ID}/score`, finalLaneScore(105));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(beforeCleanup).not.toHaveBeenCalled();

    transport.emitMessage(
      `saika/competition/${COMPETITION_ID}/lane/${LANE_ID}/state`,
      finalLaneState(command.commandId),
    );
    transport.emitMessage(
      `saika/competition/${COMPETITION_ID}/lane/${LANE_ID}/score`,
      finalLaneScore(110, command.commandId),
    );

    await vi.waitFor(() => {
      expect(beforeCleanup).toHaveBeenCalledOnce();
      expect(transport.publications.some((entry) => entry.topic.endsWith('/leave-competition'))).toBe(true);
    });
    const leavePublication = transport.publications.find((entry) => entry.topic.endsWith('/leave-competition'))!;
    const leaveCommand = JSON.parse(leavePublication.payload) as { commandId: string };
    transport.emitMessage(`saika/lane/${LANE_ID}/command/leave-competition/acknowledgement`, {
      commandId: leaveCommand.commandId,
      laneId: LANE_ID,
      status: 'error',
      error: { code: 'MQTT_NOT_IN_COMPETITION', message: 'Lane already left the competition' },
      acknowledgedAt: new Date().toISOString(),
    });

    await expect(finishing).resolves.toMatchObject({ success: true });
    expect(beforeCleanup).toHaveBeenCalledWith([
      expect.objectContaining({
        laneId: LANE_ID,
        assignment: expect.objectContaining({ athlete: expect.objectContaining({ id: PARTICIPANT_ID }) }),
        score: expect.objectContaining({ totalScoreX10: 110 }),
        shots: [expect.objectContaining({ rawScoreX10: 105 })],
      }),
    ]);
    expect(
      transport.publications
        .filter((entry) => entry.options.retain && entry.payload === '')
        .map((entry) => entry.topic),
    ).toEqual(
      expect.arrayContaining([
        `saika/competition/${COMPETITION_ID}/state`,
        `saika/competition/${COMPETITION_ID}/lane/${LANE_ID}/state`,
        `saika/competition/${COMPETITION_ID}/lane/${LANE_ID}/score`,
        `saika/competition/${COMPETITION_ID}/lane/${LANE_ID}/assignment`,
      ]),
    );
    expect(service.getSnapshot()).toMatchObject({ activeCompetitionId: null, competitions: [] });
  });

  it('atomically marks result-free completion as prepared before Lane cleanup', async () => {
    const service = createService(transport);
    await service.connect('mqtt://localhost:1883');
    await createCompetition(service);
    const stateTopic = `saika/competition/${COMPETITION_ID}/state`;
    const initialStatePublicationCount = transport.publications.filter(
      (entry) => entry.topic === stateTopic && entry.payload !== '',
    ).length;

    const finishing = service.finishCompetition(COMPETITION_ID);
    await vi.waitFor(() =>
      expect(transport.publications.some((entry) => entry.topic.endsWith('/finish-competition'))).toBe(true),
    );
    const finishPublication = transport.publications.find((entry) => entry.topic.endsWith('/finish-competition'))!;
    const finishCommand = JSON.parse(finishPublication.payload) as { commandId: string };
    transport.emitMessage(`saika/competition/${COMPETITION_ID}/command/finish-competition/acknowledgement/${LANE_ID}`, {
      commandId: finishCommand.commandId,
      laneId: LANE_ID,
      status: 'done',
      acknowledgedAt: new Date().toISOString(),
    });

    await vi.waitFor(() =>
      expect(transport.publications.some((entry) => entry.topic.endsWith('/leave-competition'))).toBe(true),
    );
    const completionPublications = transport.publications
      .filter((entry) => entry.topic === stateTopic && entry.payload !== '')
      .slice(initialStatePublicationCount);
    expect(completionPublications).toHaveLength(1);
    expect(JSON.parse(completionPublications[0]!.payload)).toMatchObject({
      phase: 'MATCH_COMPLETE',
      cleanupPreparedAt: expect.any(String),
    });

    const leavePublication = transport.publications.find((entry) => entry.topic.endsWith('/leave-competition'))!;
    const leaveCommand = JSON.parse(leavePublication.payload) as { commandId: string };
    transport.emitMessage(`saika/lane/${LANE_ID}/command/leave-competition/acknowledgement`, {
      commandId: leaveCommand.commandId,
      laneId: LANE_ID,
      status: 'done',
      acknowledgedAt: new Date().toISOString(),
    });

    await expect(finishing).resolves.toMatchObject({ success: true });
  });

  it('does not save or clean up results when final Lane snapshots do not arrive after the finish command', async () => {
    const service = createService(transport);
    await service.connect('mqtt://localhost:1883');
    await createCompetition(service);
    const beforeCleanup = vi.fn().mockResolvedValue(true);

    const finishing = service.finishCompetition(COMPETITION_ID, beforeCleanup);
    await vi.waitFor(() =>
      expect(transport.publications.some((entry) => entry.topic.endsWith('/finish-competition'))).toBe(true),
    );
    const finishPublication = transport.publications.find((entry) => entry.topic.endsWith('/finish-competition'))!;
    const finishCommand = JSON.parse(finishPublication.payload) as { commandId: string };
    transport.emitMessage(`saika/competition/${COMPETITION_ID}/command/finish-competition/acknowledgement/${LANE_ID}`, {
      commandId: finishCommand.commandId,
      laneId: LANE_ID,
      status: 'done',
      acknowledgedAt: new Date().toISOString(),
    });

    await expect(finishing).resolves.toMatchObject({
      success: false,
      lanes: [
        {
          laneId: LANE_ID,
          status: 'error',
          error: {
            code: 'MQTT_FINAL_SNAPSHOT_INCOMPLETE',
            message: expect.stringContaining('final competition state'),
          },
        },
      ],
    });
    expect(beforeCleanup).not.toHaveBeenCalled();
    expect(transport.publications.some((entry) => entry.topic.endsWith('/leave-competition'))).toBe(false);
    expect(transport.publications.some((entry) => entry.options.retain && entry.payload === '')).toBe(false);
    expect(service.getSnapshot()).toMatchObject({
      activeCompetitionId: COMPETITION_ID,
      competitions: [expect.objectContaining({ phase: 'NOT_STARTED' })],
      lastCommand: expect.objectContaining({ success: false }),
    });
  });

  it('rejects a final Lane score whose scoring mode differs from the competition', async () => {
    const service = createService(transport);
    await service.connect('mqtt://localhost:1883');
    await createCompetition(service);
    const beforeCleanup = vi.fn().mockResolvedValue(false);

    const finishing = service.finishCompetition(COMPETITION_ID, beforeCleanup);
    await vi.waitFor(() =>
      expect(transport.publications.some((entry) => entry.topic.endsWith('/finish-competition'))).toBe(true),
    );
    const finishPublication = transport.publications.find((entry) => entry.topic.endsWith('/finish-competition'))!;
    const finishCommand = JSON.parse(finishPublication.payload) as { commandId: string };
    transport.emitMessage(`saika/competition/${COMPETITION_ID}/command/finish-competition/acknowledgement/${LANE_ID}`, {
      commandId: finishCommand.commandId,
      laneId: LANE_ID,
      status: 'done',
      acknowledgedAt: new Date().toISOString(),
    });
    transport.emitMessage(
      `saika/competition/${COMPETITION_ID}/lane/${LANE_ID}/state`,
      finalLaneState(finishCommand.commandId),
    );
    transport.emitMessage(`saika/competition/${COMPETITION_ID}/lane/${LANE_ID}/score`, {
      ...finalLaneScore(6000, finishCommand.commandId),
      acc: 'RING',
    });

    await expect(finishing).resolves.toMatchObject({
      success: false,
      lanes: [
        expect.objectContaining({
          laneId: LANE_ID,
          error: expect.objectContaining({ message: expect.stringContaining('scoring mode') }),
        }),
      ],
    });
    expect(beforeCleanup).not.toHaveBeenCalled();
  });

  it('keeps a completed competition recoverable when result publication is incomplete', async () => {
    const service = createService(transport);
    await service.connect('mqtt://localhost:1883');
    await createCompetition(service);
    const beforeCleanup = vi.fn().mockResolvedValue(false);

    const firstFinish = service.finishCompetition(COMPETITION_ID, beforeCleanup);
    await vi.waitFor(() =>
      expect(transport.publications.some((entry) => entry.topic.endsWith('/finish-competition'))).toBe(true),
    );
    const finishPublication = transport.publications.find((entry) => entry.topic.endsWith('/finish-competition'))!;
    const finishCommand = JSON.parse(finishPublication.payload) as { commandId: string };
    transport.emitMessage(`saika/competition/${COMPETITION_ID}/command/finish-competition/acknowledgement/${LANE_ID}`, {
      commandId: finishCommand.commandId,
      laneId: LANE_ID,
      status: 'done',
      acknowledgedAt: new Date().toISOString(),
    });
    emitFinalLaneSnapshots(transport, finishCommand.commandId);

    await expect(firstFinish).resolves.toMatchObject({ success: true });
    const completedStatePublication = transport.publications
      .filter((entry) => entry.topic === `saika/competition/${COMPETITION_ID}/state` && entry.payload !== '')
      .at(-1)!;
    transport.emitRawMessage(completedStatePublication.topic, Buffer.from(completedStatePublication.payload));

    expect(service.getSnapshot()).toMatchObject({
      activeCompetitionId: COMPETITION_ID,
      competitions: [expect.objectContaining({ phase: 'MATCH_COMPLETE' })],
    });
    expect(transport.publications.some((entry) => entry.topic.endsWith('/leave-competition'))).toBe(false);
    expect(transport.publications.some((entry) => entry.options.retain && entry.payload === '')).toBe(false);

    beforeCleanup.mockResolvedValue(true);
    const retry = service.finishCompetition(COMPETITION_ID, beforeCleanup);
    await vi.waitFor(() =>
      expect(transport.publications.some((entry) => entry.topic.endsWith('/leave-competition'))).toBe(true),
    );
    const leavePublication = transport.publications.find((entry) => entry.topic.endsWith('/leave-competition'))!;
    const leaveCommand = JSON.parse(leavePublication.payload) as { commandId: string };
    transport.emitMessage(`saika/lane/${LANE_ID}/command/leave-competition/acknowledgement`, {
      commandId: leaveCommand.commandId,
      laneId: LANE_ID,
      status: 'done',
      acknowledgedAt: new Date().toISOString(),
    });

    await expect(retry).resolves.toMatchObject({ success: true });
    expect(transport.publications.filter((entry) => entry.topic.endsWith('/finish-competition'))).toHaveLength(1);
    expect(service.getSnapshot()).toMatchObject({ activeCompetitionId: null, competitions: [] });
  });

  it('resumes cleanup after restart without repeating completed result publication', async () => {
    const service = createService(transport);
    await service.connect('mqtt://localhost:1883');
    transport.emitMessage(`saika/competition/${COMPETITION_ID}/state`, {
      competitionId: COMPETITION_ID,
      competitionTypeId: 'BR60S',
      competitionTypeName: '10m Beam Rifle 60 shots standing',
      discipline: 'BEAM_RIFLE_10M',
      roundName: 'Qualification',
      acc: 'DECIMAL',
      shotsPerSeries: 10,
      totalSeries: 6,
      totalShots: 60,
      laneIds: [LANE_ID],
      phase: 'MATCH_COMPLETE',
      startedAt: '2026-08-26T00:00:00.000Z',
      finishedAt: '2026-08-26T01:00:00.000Z',
      cleanupPreparedAt: '2026-08-26T01:00:01.000Z',
      publishedAt: '2026-08-26T01:00:01.000Z',
    });
    const beforeCleanup = vi.fn().mockResolvedValue(true);

    const retry = service.finishCompetition(COMPETITION_ID, beforeCleanup);
    await vi.waitFor(() =>
      expect(transport.publications.some((entry) => entry.topic.endsWith('/leave-competition'))).toBe(true),
    );
    const leavePublication = transport.publications.find((entry) => entry.topic.endsWith('/leave-competition'))!;
    const leaveCommand = JSON.parse(leavePublication.payload) as { commandId: string };
    transport.emitMessage(`saika/lane/${LANE_ID}/command/leave-competition/acknowledgement`, {
      commandId: leaveCommand.commandId,
      laneId: LANE_ID,
      status: 'error',
      error: { code: 'MQTT_NOT_IN_COMPETITION', message: 'Lane already left the competition' },
      acknowledgedAt: new Date().toISOString(),
    });

    await expect(retry).resolves.toMatchObject({ success: true });
    expect(beforeCleanup).not.toHaveBeenCalled();
    expect(service.getSnapshot()).toMatchObject({ activeCompetitionId: null, competitions: [] });
  });

  it('preserves competition state when a retained lane tombstone cannot be published', async () => {
    const service = createService(transport);
    await service.connect('mqtt://localhost:1883');
    await createCompetition(service);
    const beforeCleanup = vi.fn().mockResolvedValue(true);
    const finishing = service.finishCompetition(COMPETITION_ID, beforeCleanup);
    await vi.waitFor(() =>
      expect(transport.publications.some((entry) => entry.topic.endsWith('/finish-competition'))).toBe(true),
    );
    const finishPublication = transport.publications.find((entry) => entry.topic.endsWith('/finish-competition'))!;
    const finishCommand = JSON.parse(finishPublication.payload) as { commandId: string };
    transport.emitMessage(`saika/competition/${COMPETITION_ID}/command/finish-competition/acknowledgement/${LANE_ID}`, {
      commandId: finishCommand.commandId,
      laneId: LANE_ID,
      status: 'error',
      error: { code: 'COMPETITION_ALREADY_FINISHED', message: 'Competition is already finished' },
      acknowledgedAt: new Date().toISOString(),
    });
    emitFinalLaneSnapshots(transport, finishCommand.commandId);
    await vi.waitFor(() =>
      expect(transport.publications.some((entry) => entry.topic.endsWith('/leave-competition'))).toBe(true),
    );
    transport.publishErrorForTopic = (topic) =>
      topic.endsWith(`/lane/${LANE_ID}/score`) ? new Error('offline') : null;
    const leavePublication = transport.publications.find((entry) => entry.topic.endsWith('/leave-competition'))!;
    const leaveCommand = JSON.parse(leavePublication.payload) as { commandId: string };
    transport.emitMessage(`saika/lane/${LANE_ID}/command/leave-competition/acknowledgement`, {
      commandId: leaveCommand.commandId,
      laneId: LANE_ID,
      status: 'done',
      acknowledgedAt: new Date().toISOString(),
    });

    await expect(finishing).rejects.toThrow('Failed to clear 1 retained MQTT competition topic(s)');
    expect(service.getSnapshot()).toMatchObject({
      activeCompetitionId: COMPETITION_ID,
      competitions: [
        expect.objectContaining({
          competitionId: COMPETITION_ID,
          laneIds: [LANE_ID],
          cleanupPreparedAt: expect.any(String),
        }),
      ],
    });
    expect(beforeCleanup).toHaveBeenCalledOnce();
    expect(
      transport.publications.some(
        (entry) => entry.topic === `saika/competition/${COMPETITION_ID}/state` && entry.payload === '',
      ),
    ).toBe(false);

    transport.publishErrorForTopic = null;
    const retry = service.finishCompetition(COMPETITION_ID, beforeCleanup);
    await vi.waitFor(() =>
      expect(transport.publications.filter((entry) => entry.topic.endsWith('/leave-competition'))).toHaveLength(2),
    );
    const retryLeavePublication = transport.publications
      .filter((entry) => entry.topic.endsWith('/leave-competition'))
      .at(-1)!;
    const retryLeaveCommand = JSON.parse(retryLeavePublication.payload) as { commandId: string };
    transport.emitMessage(`saika/lane/${LANE_ID}/command/leave-competition/acknowledgement`, {
      commandId: retryLeaveCommand.commandId,
      laneId: LANE_ID,
      status: 'error',
      error: { code: 'MQTT_NOT_IN_COMPETITION', message: 'Lane already left the competition' },
      acknowledgedAt: new Date().toISOString(),
    });

    await expect(retry).resolves.toMatchObject({ success: true });
    expect(beforeCleanup).toHaveBeenCalledOnce();
    expect(
      transport.publications.some(
        (entry) => entry.topic === `saika/competition/${COMPETITION_ID}/lane/${LANE_ID}/score` && entry.payload === '',
      ),
    ).toBe(true);
    expect(service.getSnapshot()).toMatchObject({ activeCompetitionId: null, competitions: [] });
  });
});
