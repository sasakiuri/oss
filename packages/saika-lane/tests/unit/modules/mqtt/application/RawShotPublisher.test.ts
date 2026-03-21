// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RawShotPublisher } from '@/main/modules/mqtt/application/RawShotPublisher';
import type { IMqttClientService } from '@/main/modules/mqtt/infra/IMqttClientService';
import { ImpactPoint } from '@/main/modules/session/domain/ImpactPoint';
import { Mode } from '@/main/modules/session/domain/Mode';
import { Score } from '@/main/modules/session/domain/Score';
import { Shot } from '@/main/modules/session/domain/Shot';
import type { ShotRecordedEvent } from '@/main/shared-infra/events/coreEvents';
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
  const store = new Map<string, unknown>([['mqtt.laneId', 'test-lane-uuid']]);
  return {
    get: vi.fn(<T>(key: string) => (store.get(key) as T) ?? (null as T)),
    set: vi.fn(),
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

function createTestShot(
  overrides?: Partial<{
    x: number | null;
    y: number | null;
    score: number;
    mode: 'SIGHTING' | 'MATCH';
    innerTen: boolean;
  }>,
): Shot {
  const x = overrides && 'x' in overrides ? overrides.x : 1.5;
  const y = overrides && 'y' in overrides ? overrides.y : -2.3;
  const score = overrides?.score ?? 105;
  const mode = overrides?.mode ?? 'MATCH';
  const innerTen = overrides?.innerTen ?? false;

  return Shot.create({
    impactPoint: x !== null && x !== undefined && y !== null && y !== undefined ? new ImpactPoint(x, y) : null,
    score: new Score(score),
    mode: mode === 'SIGHTING' ? Mode.sighting() : Mode.match(),
    timestamp: new Date('2026-02-24T12:00:00.000Z'),
    shotNumber: 1,
    seriesNumber: 1,
    innerTen,
  });
}

describe('RawShotPublisher', () => {
  let mqttClient: IMqttClientService;
  let eventBus: IEventBus;
  let storage: ILocalStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    mqttClient = createMockMqttClient();
    eventBus = createMockEventBus();
    storage = createMockStorage();
    // Constructor subscribes to ShotRecorded
    new RawShotPublisher(mqttClient, eventBus, storage);
  });

  it('should subscribe to ShotRecorded events', () => {
    expect(eventBus.on).toHaveBeenCalledWith('ShotRecorded', expect.any(Function));
  });

  it('should publish shot data on ShotRecorded event', () => {
    const shot = createTestShot();
    const event: ShotRecordedEvent = {
      type: 'ShotRecorded',
      timestamp: Date.now(),
      aggregateId: 'session-123',
      shot,
      scoringMode: 'DECIMAL',
    };

    (eventBus as { emit: Function }).emit(event);

    expect(mqttClient.publish).toHaveBeenCalledWith('saika/lane/test-lane-uuid/hardware/shot', expect.any(String), {
      qos: 1,
      retain: false,
    });
  });

  it('should include correct payload fields', () => {
    const shot = createTestShot({ x: 3.2, y: -1.5, score: 98, innerTen: false });
    const event: ShotRecordedEvent = {
      type: 'ShotRecorded',
      timestamp: Date.now(),
      aggregateId: 'session-123',
      shot,
      scoringMode: 'DECIMAL',
    };

    (eventBus as { emit: Function }).emit(event);

    const publishedPayload = JSON.parse((mqttClient.publish as ReturnType<typeof vi.fn>).mock.calls[0]![1] as string);

    expect(publishedPayload.laneId).toBe('test-lane-uuid');
    expect(publishedPayload.shotId).toBe(shot.id);
    expect(publishedPayload.x).toBe(3.2);
    expect(publishedPayload.y).toBe(-1.5);
    expect(publishedPayload.rawScoreX10).toBe(98);
    expect(publishedPayload.innerTen).toBe(false);
    expect(publishedPayload.mode).toBe('MATCH');
    expect(publishedPayload.timestamp).toBe('2026-02-24T12:00:00.000Z');
  });

  it('should handle null impactPoint (miss shot)', () => {
    const shot = createTestShot({ x: null, y: null, score: 0 });
    const event: ShotRecordedEvent = {
      type: 'ShotRecorded',
      timestamp: Date.now(),
      aggregateId: 'session-123',
      shot,
      scoringMode: 'RING',
    };

    (eventBus as { emit: Function }).emit(event);

    const publishedPayload = JSON.parse((mqttClient.publish as ReturnType<typeof vi.fn>).mock.calls[0]![1] as string);

    expect(publishedPayload.x).toBeNull();
    expect(publishedPayload.y).toBeNull();
    expect(publishedPayload.rawScoreX10).toBe(0);
  });

  it('should handle innerTen flag', () => {
    const shot = createTestShot({ score: 109, innerTen: true });
    const event: ShotRecordedEvent = {
      type: 'ShotRecorded',
      timestamp: Date.now(),
      aggregateId: 'session-123',
      shot,
      scoringMode: 'DECIMAL',
    };

    (eventBus as { emit: Function }).emit(event);

    const publishedPayload = JSON.parse((mqttClient.publish as ReturnType<typeof vi.fn>).mock.calls[0]![1] as string);

    expect(publishedPayload.rawScoreX10).toBe(109);
    expect(publishedPayload.innerTen).toBe(true);
  });

  it('should not publish when mqtt client is not connected', () => {
    (mqttClient.isConnected as ReturnType<typeof vi.fn>).mockReturnValue(false);

    const shot = createTestShot();
    const event: ShotRecordedEvent = {
      type: 'ShotRecorded',
      timestamp: Date.now(),
      aggregateId: 'session-123',
      shot,
      scoringMode: 'DECIMAL',
    };

    (eventBus as { emit: Function }).emit(event);

    expect(mqttClient.publish).not.toHaveBeenCalled();
  });

  it('should publish with SIGHTING mode', () => {
    const shot = createTestShot({ mode: 'SIGHTING' });
    const event: ShotRecordedEvent = {
      type: 'ShotRecorded',
      timestamp: Date.now(),
      aggregateId: 'session-123',
      shot,
      scoringMode: 'DECIMAL',
    };

    (eventBus as { emit: Function }).emit(event);

    const publishedPayload = JSON.parse((mqttClient.publish as ReturnType<typeof vi.fn>).mock.calls[0]![1] as string);

    expect(publishedPayload.mode).toBe('SIGHTING');
  });

  it('should log error when publish fails', async () => {
    vi.useFakeTimers();
    (mqttClient.publish as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('publish error'));

    const shot = createTestShot();
    const event: ShotRecordedEvent = {
      type: 'ShotRecorded',
      timestamp: Date.now(),
      aggregateId: 'session-123',
      shot,
      scoringMode: 'DECIMAL',
    };

    (eventBus as { emit: Function }).emit(event);

    await vi.advanceTimersByTimeAsync(0);

    expect(mockLogger.error).toHaveBeenCalledWith(
      '[RawShotPublisher] Failed to publish shot',
      'mqtt',
      expect.objectContaining({ error: 'publish error' }),
    );
    vi.useRealTimers();
  });
});
