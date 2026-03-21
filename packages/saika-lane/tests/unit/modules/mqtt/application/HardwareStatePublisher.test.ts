// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HardwareStatePublisher } from '@/main/modules/mqtt/application/HardwareStatePublisher';
import type { IMqttClientService } from '@/main/modules/mqtt/infra/IMqttClientService';
import { TargetManufacturer } from '@/main/modules/target/domain/TargetManufacturer';
import type { ConnectionEstablishedEvent, ConnectionLostEvent } from '@/main/shared-infra/events/coreEvents';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

// ── mock logger ────────────────────────────────────────────────
const mockLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() };
vi.mock('@/main/shared-infra/logging/createLogger', () => ({
  getLogger: () => mockLogger,
}));

function createMockMqttClient(): IMqttClientService {
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    publish: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    setWill: vi.fn(),
    onMessage: vi.fn().mockReturnValue(() => {}),
    onConnect: vi.fn(),
    onDisconnect: vi.fn(),
    isConnected: vi.fn().mockReturnValue(true),
  };
}

function createMockStorage(): ILocalStorage {
  const store = new Map<string, unknown>([
    ['mqtt.laneId', 'test-lane-uuid'],
    ['mqtt.settings', { laneAlias: 'Lane 1' }],
  ]);
  return {
    get: vi.fn(<T>(key: string) => (store.get(key) as T) ?? (null as T)),
    set: vi.fn(<T>(key: string, value: T) => {
      store.set(key, value);
    }),
    delete: vi.fn(),
    has: vi.fn((key: string) => store.has(key)),
  } as unknown as ILocalStorage;
}

function createMockEventBus(): IEventBus {
  const handlers = new Map<string, Set<Function>>();
  return {
    emit: vi.fn((event) => {
      const fns = handlers.get(event.type);
      if (fns) for (const fn of fns) fn(event);
    }),
    on: vi.fn((type: string, handler: Function) => {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type)!.add(handler);
      return () => handlers.get(type)?.delete(handler);
    }),
  } as unknown as IEventBus;
}

describe('HardwareStatePublisher', () => {
  let mqttClient: IMqttClientService;
  let eventBus: IEventBus;
  let storage: ILocalStorage;
  let publisher: HardwareStatePublisher;

  beforeEach(() => {
    vi.useFakeTimers();
    mqttClient = createMockMqttClient();
    eventBus = createMockEventBus();
    storage = createMockStorage();
    publisher = new HardwareStatePublisher(mqttClient, eventBus, storage, '1.0.0');
  });

  afterEach(() => {
    publisher.stopHeartbeat();
    vi.useRealTimers();
  });

  it('should subscribe to ConnectionEstablished and ConnectionLost events', () => {
    expect(eventBus.on).toHaveBeenCalledWith('ConnectionEstablished', expect.any(Function));
    expect(eventBus.on).toHaveBeenCalledWith('ConnectionLost', expect.any(Function));
  });

  it('should publish connected state on ConnectionEstablished', () => {
    const event: ConnectionEstablishedEvent = {
      type: 'ConnectionEstablished',
      timestamp: Date.now(),
      aggregateId: 'conn-123',
      manufacturer: TargetManufacturer.kohto(),
      portPath: 'COM3',
      deviceId: null,
    };

    (eventBus as { emit: Function }).emit(event);

    expect(mqttClient.publish).toHaveBeenCalledWith(
      'saika/lane/test-lane-uuid/hardware/state',
      expect.stringContaining('"status":"connected"'),
      { qos: 1, retain: true },
    );
  });

  it('should include manufacturer and portPath in connected state', () => {
    const event: ConnectionEstablishedEvent = {
      type: 'ConnectionEstablished',
      timestamp: Date.now(),
      aggregateId: 'conn-123',
      manufacturer: TargetManufacturer.sius(),
      portPath: '/dev/ttyUSB0',
      deviceId: null,
    };

    (eventBus as { emit: Function }).emit(event);

    const publishedPayload = JSON.parse((mqttClient.publish as ReturnType<typeof vi.fn>).mock.calls[0]![1] as string);
    expect(publishedPayload.connection).toMatchObject({
      status: 'connected',
      manufacturer: 'SIUS',
      portPath: '/dev/ttyUSB0',
      connectionId: 'conn-123',
    });
  });

  it('should publish disconnected state on ConnectionLost', () => {
    const event: ConnectionLostEvent = {
      type: 'ConnectionLost',
      timestamp: Date.now(),
      aggregateId: 'conn-123',
      reason: 'USB disconnected',
    };

    (eventBus as { emit: Function }).emit(event);

    expect(mqttClient.publish).toHaveBeenCalledWith(
      'saika/lane/test-lane-uuid/hardware/state',
      expect.stringContaining('"status":"disconnected"'),
      { qos: 1, retain: true },
    );
  });

  it('should not publish when mqtt client is not connected', () => {
    (mqttClient.isConnected as ReturnType<typeof vi.fn>).mockReturnValue(false);

    publisher.publishState();

    expect(mqttClient.publish).not.toHaveBeenCalled();
  });

  it('should include laneId, laneAlias, and appVersion in payload', () => {
    publisher.publishState();

    const publishedPayload = JSON.parse((mqttClient.publish as ReturnType<typeof vi.fn>).mock.calls[0]![1] as string);
    expect(publishedPayload.laneId).toBe('test-lane-uuid');
    expect(publishedPayload.laneAlias).toBe('Lane 1');
    expect(publishedPayload.appVersion).toBe('1.0.0');
    expect(publishedPayload.publishedAt).toBeDefined();
  });

  // ── Heartbeat ──
  describe('heartbeat', () => {
    it('should publish state at interval', () => {
      publisher.startHeartbeat(1000);

      vi.advanceTimersByTime(3000);

      // 3 heartbeat calls
      expect(mqttClient.publish).toHaveBeenCalledTimes(3);
    });

    it('should stop publishing when stopHeartbeat is called', () => {
      publisher.startHeartbeat(1000);

      vi.advanceTimersByTime(2000);
      publisher.stopHeartbeat();
      vi.advanceTimersByTime(3000);

      // Only 2 calls before stop
      expect(mqttClient.publish).toHaveBeenCalledTimes(2);
    });

    it('should restart heartbeat when startHeartbeat is called again', () => {
      publisher.startHeartbeat(1000);
      vi.advanceTimersByTime(1500);

      publisher.startHeartbeat(2000);
      vi.advanceTimersByTime(4000);

      // 1 from first timer + 2 from second timer
      expect(mqttClient.publish).toHaveBeenCalledTimes(3);
    });
  });

  // ── Will ──
  describe('will', () => {
    it('should return correct will topic', () => {
      expect(publisher.getWillTopic()).toBe('saika/lane/test-lane-uuid/hardware/state');
    });

    it('should return will payload with offline status', () => {
      const payload = JSON.parse(publisher.getWillPayload());
      expect(payload.connection.status).toBe('offline');
      expect(payload.laneId).toBe('test-lane-uuid');
      expect(payload.appVersion).toBe('1.0.0');
    });
  });

  // ── Error handling ──
  it('should log error when publish fails', async () => {
    (mqttClient.publish as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('publish error'));

    publisher.publishState();

    // Allow the promise rejection to be handled
    await vi.advanceTimersByTimeAsync(0);

    expect(mockLogger.error).toHaveBeenCalledWith(
      '[HardwareStatePublisher] Failed to publish state',
      'mqtt',
      expect.objectContaining({ error: 'publish error' }),
    );
  });
});
