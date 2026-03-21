// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import { LaneScorePublisher } from '@/main/modules/mqtt/application/LaneScorePublisher';
import type { IMqttClientService } from '@/main/modules/mqtt/infra/IMqttClientService';
import { ImpactPoint } from '@/main/modules/session/domain/ImpactPoint';
import { Mode } from '@/main/modules/session/domain/Mode';
import { Score } from '@/main/modules/session/domain/Score';
import { Shot } from '@/main/modules/session/domain/Shot';
import type { QueryBus } from '@/main/shared-infra/cqrs/QueryBus';
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
  const store = new Map<string, unknown>([['mqtt.laneId', 'lane-uuid']]);
  return {
    get: vi.fn(<T>(key: string) => (store.get(key) as T) ?? (null as T)),
    set: vi.fn(),
    delete: vi.fn(),
    has: vi.fn(),
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

function createMatchShot(): Shot {
  return Shot.create({
    impactPoint: new ImpactPoint(1.0, -1.0),
    score: new Score(105),
    mode: Mode.match(),
    timestamp: new Date('2026-02-24T12:00:00Z'),
    shotNumber: 1,
    seriesNumber: 1,
    innerTen: false,
  });
}

function createSightingShot(): Shot {
  return Shot.create({
    impactPoint: new ImpactPoint(0.5, 0.5),
    score: new Score(90),
    mode: Mode.sighting(),
    timestamp: new Date('2026-02-24T12:00:00Z'),
    shotNumber: 1,
    seriesNumber: 0,
    innerTen: false,
  });
}

describe('LaneScorePublisher', () => {
  let mqttClient: IMqttClientService;
  let eventBus: IEventBus;
  let storage: ILocalStorage;
  let competitionRepository: ICompetitionRepository;
  let queryBus: QueryBus;

  const mockCompetition = {
    id: 'comp-uuid',
    sessionId: 'session-uuid',
    phase: 'ACTIVE',
    currentStageIndex: 1,
    currentSeriesIndex: 2,
    seriesShotCount: 5,
    config: {
      name: 'Qualification',
      shotsPerSeries: 10,
      acc: 'DECIMAL',
      stages: [
        { name: 'Sighting', scored: false, series: [{ maxShots: 0 }] },
        { name: '1st Stage', scored: true, series: [{ maxShots: 10 }, { maxShots: 10 }, { maxShots: 10 }] },
      ],
    },
  } as unknown as CompetitionState;

  beforeEach(() => {
    vi.clearAllMocks();
    mqttClient = createMockMqttClient();
    eventBus = createMockEventBus();
    storage = createMockStorage();
    competitionRepository = {
      save: vi.fn(),
      findById: vi.fn(),
      findBySessionId: vi.fn(),
      findActive: vi.fn().mockResolvedValue(mockCompetition),
      delete: vi.fn(),
    };
    queryBus = {
      register: vi.fn(),
      execute: vi.fn().mockResolvedValue({
        sessionId: 'session-uuid',
        totalScore: 1055,
        seriesScores: [1000, 1055],
        shotCount: 15,
        discipline: 'BEAM_RIFLE_10M',
        mode: 'MATCH',
      }),
      use: vi.fn(),
    } as unknown as QueryBus;

    new LaneScorePublisher(mqttClient, eventBus, storage, competitionRepository, queryBus);
  });

  it('should subscribe to ShotRecorded events', () => {
    expect(eventBus.on).toHaveBeenCalledWith('ShotRecorded', expect.any(Function));
  });

  it('should publish score on MATCH ShotRecorded event', async () => {
    const event: ShotRecordedEvent = {
      type: 'ShotRecorded',
      timestamp: Date.now(),
      aggregateId: 'session-uuid',
      shot: createMatchShot(),
      scoringMode: 'DECIMAL',
    };

    (eventBus as { emit: Function }).emit(event);

    await vi.waitFor(() => {
      expect(mqttClient.publish).toHaveBeenCalled();
    });

    expect(mqttClient.publish).toHaveBeenCalledWith(
      'saika/competition/comp-uuid/lane/lane-uuid/score',
      expect.any(String),
      { qos: 1, retain: true },
    );
  });

  it('should NOT publish score for SIGHTING shots', async () => {
    const event: ShotRecordedEvent = {
      type: 'ShotRecorded',
      timestamp: Date.now(),
      aggregateId: 'session-uuid',
      shot: createSightingShot(),
      scoringMode: 'DECIMAL',
    };

    (eventBus as { emit: Function }).emit(event);

    await new Promise((r) => setTimeout(r, 10));
    expect(mqttClient.publish).not.toHaveBeenCalled();
  });

  it('should include correct score payload', async () => {
    const event: ShotRecordedEvent = {
      type: 'ShotRecorded',
      timestamp: Date.now(),
      aggregateId: 'session-uuid',
      shot: createMatchShot(),
      scoringMode: 'DECIMAL',
    };

    (eventBus as { emit: Function }).emit(event);

    await vi.waitFor(() => {
      expect(mqttClient.publish).toHaveBeenCalled();
    });

    const payload = JSON.parse((mqttClient.publish as ReturnType<typeof vi.fn>).mock.calls[0]![1] as string);

    expect(payload.competitionId).toBe('comp-uuid');
    expect(payload.laneId).toBe('lane-uuid');
    expect(payload.sessionId).toBe('session-uuid');
    expect(payload.totalScoreX10).toBe(1055);
    expect(payload.totalShotCount).toBe(15);
    expect(payload.acc).toBe('DECIMAL');
    expect(payload.stages).toBeDefined();
    expect(payload.publishedAt).toBeDefined();
  });

  it('should not publish when mqtt client is not connected', async () => {
    (mqttClient.isConnected as ReturnType<typeof vi.fn>).mockReturnValue(false);

    const event: ShotRecordedEvent = {
      type: 'ShotRecorded',
      timestamp: Date.now(),
      aggregateId: 'session-uuid',
      shot: createMatchShot(),
      scoringMode: 'DECIMAL',
    };

    (eventBus as { emit: Function }).emit(event);

    await new Promise((r) => setTimeout(r, 10));
    expect(mqttClient.publish).not.toHaveBeenCalled();
  });

  it('should not publish when no active competition', async () => {
    (competitionRepository.findActive as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const event: ShotRecordedEvent = {
      type: 'ShotRecorded',
      timestamp: Date.now(),
      aggregateId: 'session-uuid',
      shot: createMatchShot(),
      scoringMode: 'DECIMAL',
    };

    (eventBus as { emit: Function }).emit(event);

    await new Promise((r) => setTimeout(r, 10));
    expect(mqttClient.publish).not.toHaveBeenCalled();
  });
});
