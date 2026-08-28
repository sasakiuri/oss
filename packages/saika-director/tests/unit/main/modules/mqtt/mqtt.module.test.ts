// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  connectDirector,
  disconnectDirector,
  finishCompetition,
  getSnapshot,
  startEmbeddedBroker,
  stopEmbeddedBroker,
  directorCallbacks,
} = vi.hoisted(() => ({
  connectDirector: vi.fn().mockResolvedValue(undefined),
  disconnectDirector: vi.fn().mockResolvedValue(undefined),
  finishCompetition: vi.fn(),
  getSnapshot: vi.fn(),
  startEmbeddedBroker: vi.fn().mockResolvedValue(undefined),
  stopEmbeddedBroker: vi.fn().mockResolvedValue(undefined),
  directorCallbacks: {
    onStateChanged: null as ((snapshot: unknown) => void) | null,
  },
}));

vi.mock('@/main/modules/mqtt/infra/DirectorMqttService', () => ({
  DirectorMqttService: class {
    constructor(_options: unknown, callbacks: { onStateChanged?: (snapshot: unknown) => void }) {
      directorCallbacks.onStateChanged = callbacks.onStateChanged ?? null;
    }

    connect = connectDirector;
    disconnect = disconnectDirector;
    getSnapshot = getSnapshot;
    finishCompetition = finishCompetition;
  },
  sanitizeBrokerUrl: (value: string) => value,
}));

vi.mock('@/main/modules/mqtt/infra/EmbeddedMqttBroker', () => ({
  EmbeddedMqttBroker: class {
    running = false;
    port = 1883;
    start = startEmbeddedBroker;
    stop = stopEmbeddedBroker;
  },
}));

import { mqttModule } from '@/main/modules/mqtt/mqtt.module';

const COMPETITION_ID = '11111111-1111-4111-8111-111111111111';
const EVENT_ID = '22222222-2222-4222-8222-222222222222';

interface MqttHandlers {
  setBrokerConfig(input: { mode: 'embedded' | 'external'; url?: string; port?: number }): Promise<unknown>;
  finishCompetition(input: {
    competitionId: string;
    resultContext?: { eventId: string; relayNumber: number };
  }): Promise<unknown>;
}

function registerModule(eventType: string | null): {
  handlers: MqttHandlers;
  publishResults: ReturnType<typeof vi.fn>;
  queryEvent: ReturnType<typeof vi.fn>;
  emitEvent: ReturnType<typeof vi.fn>;
  config: Map<string, unknown>;
} {
  let handlers: MqttHandlers | null = null;
  const emitEvent = vi.fn();
  const publishResults = vi.fn().mockResolvedValue({
    savedCount: 0,
    errors: [`Event ${EVENT_ID} not found`],
  });
  const queryEvent = vi.fn().mockResolvedValue(
    eventType === null
      ? null
      : {
          id: EVENT_ID,
          name: 'Result event',
          eventType,
          round: 'Qualification',
          sortOrder: 0,
        },
  );
  const config = new Map<string, unknown>([
    ['mqtt.broker.port', 1883],
    ['mqtt.broker.mode', 'embedded'],
    ['mqtt.broker.url', 'mqtt://localhost:1883'],
    ['mqtt.director.id', 'director-test'],
    ['mqtt.commandTimeoutMs', 100],
    ['mqtt.startDelayMs', 0],
  ]);

  mqttModule.register({
    database: {} as never,
    eventBus: { emit: emitEvent } as never,
    commandBus: { execute: publishResults } as never,
    queryBus: { execute: queryEvent } as never,
    ipcRouter: {
      register: vi.fn((_contract, registeredHandlers) => {
        handlers = registeredHandlers as MqttHandlers;
      }),
    } as never,
    debugLogStore: { addEntry: vi.fn() } as never,
    appConfigService: {
      get: (key: string) => config.get(key),
      setMany: (values: Record<string, unknown>) => {
        for (const [key, value] of Object.entries(values)) config.set(key, value);
      },
    } as never,
    competitionTypeRegistry: {} as never,
    laneControlRepository: {} as never,
    competitionShotJournal: { append: vi.fn(), findByCompetition: vi.fn(() => []) } as never,
  });

  if (!handlers) throw new Error('MQTT handlers were not registered');
  return { handlers, publishResults, queryEvent, emitEvent, config };
}

describe('mqttModule broker transitions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connectDirector.mockResolvedValue(undefined);
    disconnectDirector.mockResolvedValue(undefined);
    getSnapshot.mockReturnValue({
      connected: true,
      brokerUrl: 'mqtt://localhost:1883',
      activeCompetitionId: COMPETITION_ID,
      lanes: [],
      competitions: [{ competitionId: COMPETITION_ID, competitionTypeId: 'BR60S', phase: 'MATCH' }],
      lastCommand: null,
    });
    finishCompetition.mockResolvedValue({
      commandId: '33333333-3333-4333-8333-333333333333',
      action: 'finish-competition',
      success: true,
      lanes: [],
    });
  });

  it('serializes overlapping broker configuration changes', async () => {
    let releaseFirstConnection!: () => void;
    const firstConnectionBarrier = new Promise<void>((resolve) => {
      releaseFirstConnection = resolve;
    });
    let activeConnections = 0;
    let maximumActiveConnections = 0;
    connectDirector.mockImplementation(async () => {
      activeConnections += 1;
      maximumActiveConnections = Math.max(maximumActiveConnections, activeConnections);
      if (connectDirector.mock.calls.length === 1) await firstConnectionBarrier;
      activeConnections -= 1;
    });
    const { handlers, config } = registerModule('BR60S');

    const firstChange = handlers.setBrokerConfig({ mode: 'external', url: 'mqtt://broker-a:1883' });
    const secondChange = handlers.setBrokerConfig({ mode: 'external', url: 'mqtt://broker-b:1883' });

    await vi.waitFor(() => expect(connectDirector).toHaveBeenCalledTimes(1));
    releaseFirstConnection();
    await Promise.all([firstChange, secondChange]);

    expect(maximumActiveConnections).toBe(1);
    expect(connectDirector.mock.calls.map(([url]) => url)).toEqual(['mqtt://broker-a:1883', 'mqtt://broker-b:1883']);
    expect(config.get('mqtt.broker.url')).toBe('mqtt://broker-b:1883');
  });

  it('waits for an in-flight competition operation before changing brokers', async () => {
    let releaseFinish!: () => void;
    const finishBarrier = new Promise<void>((resolve) => {
      releaseFinish = resolve;
    });
    finishCompetition.mockImplementationOnce(async () => {
      await finishBarrier;
      return {
        commandId: '33333333-3333-4333-8333-333333333333',
        action: 'finish-competition',
        success: true,
        lanes: [],
      };
    });
    const { handlers } = registerModule('BR60S');

    const finishing = handlers.finishCompetition({ competitionId: COMPETITION_ID });
    await vi.waitFor(() => expect(finishCompetition).toHaveBeenCalledTimes(1));
    const changingBroker = handlers.setBrokerConfig({ mode: 'external', url: 'mqtt://broker-b:1883' });
    await Promise.resolve();

    expect(disconnectDirector).not.toHaveBeenCalled();
    expect(connectDirector).not.toHaveBeenCalled();

    releaseFinish();
    await Promise.all([finishing, changingBroker]);

    expect(disconnectDirector).toHaveBeenCalledTimes(1);
    expect(connectDirector).toHaveBeenCalledWith('mqtt://broker-b:1883');
  });
});

describe('mqttModule firing-point projection', () => {
  it('lets a connected replacement use the alias number of an offline Lane', () => {
    const offlineLaneId = '44444444-4444-4444-8444-444444444444';
    const replacementLaneId = '55555555-5555-4555-8555-555555555555';
    const { emitEvent } = registerModule('BR60S');
    if (!directorCallbacks.onStateChanged) throw new Error('Director callback was not registered');

    directorCallbacks.onStateChanged({
      connected: true,
      brokerUrl: 'mqtt://localhost:1883',
      activeCompetitionId: null,
      competitions: [],
      lastCommand: null,
      lanes: [
        {
          laneId: offlineLaneId,
          laneAlias: 'Lane 1',
          hardware: { connection: { status: 'offline' } },
        },
        {
          laneId: replacementLaneId,
          laneAlias: 'Lane 1',
          hardware: { connection: { status: 'connected' } },
        },
      ],
    });

    expect(emitEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'MqttControlStateChanged',
        snapshot: expect.objectContaining({
          lanes: [
            expect.objectContaining({ laneId: offlineLaneId, firingPointNumber: null }),
            expect.objectContaining({ laneId: replacementLaneId, firingPointNumber: 1 }),
          ],
        }),
      }),
    );
  });
});

describe('mqttModule finishCompetition', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSnapshot.mockReturnValue({
      connected: true,
      brokerUrl: 'mqtt://localhost:1883',
      activeCompetitionId: COMPETITION_ID,
      lanes: [],
      competitions: [{ competitionId: COMPETITION_ID, competitionTypeId: 'BR60S', phase: 'MATCH' }],
      lastCommand: null,
    });
    finishCompetition.mockResolvedValue({
      commandId: '33333333-3333-4333-8333-333333333333',
      action: 'finish-competition',
      success: true,
      lanes: [],
    });
  });

  it('rejects a mismatched result event before sending the finish command', async () => {
    const { handlers, queryEvent } = registerModule('BP60');

    await expect(
      handlers.finishCompetition({
        competitionId: COMPETITION_ID,
        resultContext: { eventId: EVENT_ID, relayNumber: 1 },
      }),
    ).rejects.toThrow(/uses competition type BP60.*active competition uses BR60S/);

    expect(queryEvent).toHaveBeenCalledWith(expect.anything(), { eventId: EVENT_ID });
    expect(finishCompetition).not.toHaveBeenCalled();
  });

  it('starts finishing after a matching result event passes validation', async () => {
    const { handlers } = registerModule('BR60S');

    await handlers.finishCompetition({
      competitionId: COMPETITION_ID,
      resultContext: { eventId: EVENT_ID, relayNumber: 1 },
    });

    expect(finishCompetition).toHaveBeenCalledWith(COMPETITION_ID, expect.any(Function));
  });

  it('rejects result publication before the match starts', async () => {
    getSnapshot.mockReturnValue({
      connected: true,
      brokerUrl: 'mqtt://localhost:1883',
      activeCompetitionId: COMPETITION_ID,
      lanes: [],
      competitions: [{ competitionId: COMPETITION_ID, competitionTypeId: 'BR60S', phase: 'SIGHTING' }],
      lastCommand: null,
    });
    const { handlers, publishResults, queryEvent } = registerModule('BR60S');

    await expect(
      handlers.finishCompetition({
        competitionId: COMPETITION_ID,
        resultContext: { eventId: EVENT_ID, relayNumber: 1 },
      }),
    ).rejects.toThrow(`Cannot publish results while competition ${COMPETITION_ID} is in phase SIGHTING`);

    expect(queryEvent).not.toHaveBeenCalled();
    expect(publishResults).not.toHaveBeenCalled();
    expect(finishCompetition).not.toHaveBeenCalled();
  });

  it('keeps finishing recoverable when the selected result event was deleted', async () => {
    const { handlers, publishResults, queryEvent } = registerModule(null);
    finishCompetition.mockImplementationOnce(async (_competitionId, beforeCleanup) => {
      expect(await beforeCleanup([])).toBe(false);
      return {
        commandId: '33333333-3333-4333-8333-333333333333',
        action: 'finish-competition',
        success: true,
        lanes: [],
      };
    });

    const response = await handlers.finishCompetition({
      competitionId: COMPETITION_ID,
      resultContext: { eventId: EVENT_ID, relayNumber: 1 },
    });

    expect(queryEvent).toHaveBeenCalledWith(expect.anything(), { eventId: EVENT_ID });
    expect(publishResults).toHaveBeenCalled();
    expect(response).toMatchObject({
      success: true,
      resultPublication: { savedCount: 0, errors: [`Event ${EVENT_ID} not found`] },
    });
  });

  it('finishes without a result snapshot barrier when no result event was selected', async () => {
    const { handlers, queryEvent } = registerModule('BR60S');

    await handlers.finishCompetition({ competitionId: COMPETITION_ID });

    expect(queryEvent).not.toHaveBeenCalled();
    expect(finishCompetition).toHaveBeenCalledWith(COMPETITION_ID, undefined);
  });

  it('does not repeat result validation after cleanup preparation was persisted', async () => {
    getSnapshot.mockReturnValue({
      connected: true,
      brokerUrl: 'mqtt://localhost:1883',
      activeCompetitionId: COMPETITION_ID,
      lanes: [],
      competitions: [
        {
          competitionId: COMPETITION_ID,
          competitionTypeId: 'BR60S',
          cleanupPreparedAt: '2026-08-27T00:00:00.000Z',
        },
      ],
      lastCommand: null,
    });
    const { handlers, queryEvent } = registerModule('BP60');

    await handlers.finishCompetition({
      competitionId: COMPETITION_ID,
      resultContext: { eventId: EVENT_ID, relayNumber: 1 },
    });

    expect(queryEvent).not.toHaveBeenCalled();
    expect(finishCompetition).toHaveBeenCalledWith(COMPETITION_ID, expect.any(Function));
  });
});
