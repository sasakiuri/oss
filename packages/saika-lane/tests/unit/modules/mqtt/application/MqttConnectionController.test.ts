// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from 'vitest';

import {
  MqttConnectionController,
  type MqttConnectionControllerDeps,
} from '@/main/modules/mqtt/application/MqttConnectionController';
import type { IMqttClientService } from '@/main/modules/mqtt/domain/IMqttClientService';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';

vi.mock('@/main/shared-infra/logging/createLogger', () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const LANE_ID = '550e8400-e29b-41d4-a716-446655440000';

function setup(ready = true) {
  const calls: string[] = [];
  let connected = false;
  const record =
    (name: string, result?: unknown) =>
    (...args: unknown[]) => {
      calls.push(args.length > 0 ? `${name} ${JSON.stringify(args)}` : name);
      return result;
    };
  const recordAsync = (name: string) => vi.fn(async () => void calls.push(name));
  const mqttClient = {
    isConnected: () => connected,
    setWill: vi.fn(record('setWill')),
    clearWill: vi.fn(record('clearWill')),
    connect: vi.fn(async () => {
      calls.push('connect');
      connected = true;
    }),
    disconnect: vi.fn(async () => {
      calls.push('disconnect');
      connected = false;
    }),
  } as unknown as IMqttClientService;
  const eventBus = { emit: vi.fn((event: { type: string }) => calls.push(`event ${event.type}`)) };
  const settings = {
    enabled: true,
    brokerUrl: 'mqtt://user:secret@broker:1883',
    laneAlias: 'Lane 4',
    autoConnect: false,
  };
  const deps: MqttConnectionControllerDeps = {
    mqttClient,
    settingsStore: {
      getLaneId: () => LANE_ID,
      getMqttSettings: () => ({ ...settings, laneId: LANE_ID }),
      saveMqttSettings: vi.fn(
        record('saveMqttSettings'),
      ) as unknown as MqttConnectionControllerDeps['settingsStore']['saveMqttSettings'],
    },
    eventBus: eventBus as unknown as IEventBus,
    isReady: () => ready,
    credentials: undefined,
    hardwarePublisher: {
      getWillTopic: () => 'will',
      getWillPayload: () => 'offline',
      publishOfflineState: recordAsync('hardware offline'),
      publishState: vi.fn(record('hardware state')),
      resumePublishing: vi.fn(record('resume hardware')),
      setRuntimeLaneAlias: vi.fn(record('alias')),
      startHeartbeat: vi.fn(record('start heartbeat')),
      stopHeartbeat: vi.fn(record('stop heartbeat')),
    },
    safetyStatePublisher: { publishCurrentState: recordAsync('safety') },
    readyStatePublishers: [
      { publishCurrentState: recordAsync('ready 1') },
      { publishCurrentState: recordAsync('ready 2') },
    ],
    tier1Handler: { subscribe: recordAsync('subscribe'), unsubscribe: recordAsync('unsubscribe') },
    retainPublisher: { registerCallbacks: vi.fn(record('callbacks')), republish: recordAsync('republish') },
  };
  return { controller: new MqttConnectionController(deps), deps, calls, eventBus };
}

describe('MqttConnectionController', () => {
  it('publishes Lane state, subscribes, saves automatic settings and republishes before announcing', async () => {
    const { controller, calls, eventBus } = setup();
    await controller.connect({ brokerUrl: 'mqtt://user:secret@broker:1883', autoConnect: true });
    expect(calls).toEqual([
      'alias ["Lane 4"]',
      'setWill ["will","offline",1,true]',
      'connect',
      'callbacks [true]',
      'resume hardware',
      'hardware state',
      'safety',
      'ready 1',
      'ready 2',
      'start heartbeat',
      'subscribe',
      expect.stringMatching(/^saveMqttSettings /),
      'alias [null]',
      'republish',
      'event MqttConnected',
    ]);
    expect(eventBus.emit).toHaveBeenLastCalledWith(
      expect.objectContaining({ brokerUrl: 'mqtt://***@broker:1883', laneId: LANE_ID, aggregateId: LANE_ID }),
    );
  });

  it('connects without a will while the hardware topic has no Lane ID', async () => {
    const { controller, calls, deps } = setup();
    deps.hardwarePublisher.getWillTopic = () => null;

    await controller.connect({ brokerUrl: 'mqtt://broker:1883' });

    expect(deps.mqttClient.setWill).not.toHaveBeenCalled();
    // A will left from an earlier connection must not be reused either.
    expect(calls.slice(0, 4)).toEqual(['alias ["Lane 4"]', 'clearWill', 'connect', 'callbacks [true]']);
  });

  it('skips competition-owned states until READY and joins an identical in-flight connection', async () => {
    const { controller, calls, deps } = setup(false);
    const first = controller.connect({ brokerUrl: 'mqtt://broker:1883' });
    const second = controller.connect({ brokerUrl: 'mqtt://broker:1883' });
    await Promise.all([first, second]);
    expect(deps.mqttClient.connect).toHaveBeenCalledOnce();
    expect(calls).not.toContain('ready 1');
  });

  it('reports the last connection error until a later connection succeeds', async () => {
    const { controller, deps, calls } = setup();
    vi.mocked(deps.retainPublisher.republish).mockRejectedValueOnce(new Error('score replay failed'));
    await expect(controller.connect({ brokerUrl: 'mqtt://broker:1883' })).rejects.toThrow('score replay failed');
    expect(calls.slice(-5)).toEqual([
      'stop heartbeat',
      'hardware offline',
      'unsubscribe',
      'disconnect',
      'event MqttDisconnected',
    ]);
    expect(controller.status()).toEqual({
      status: 'disconnected',
      brokerUrl: 'mqtt://user:secret@broker:1883',
      laneId: LANE_ID,
      error: 'score replay failed',
    });
    await controller.connect({ brokerUrl: 'mqtt://broker:1883' });
    expect(controller.status()).toEqual({
      status: 'connected',
      brokerUrl: 'mqtt://user:secret@broker:1883',
      laneId: LANE_ID,
    });
  });
});
