// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import { LaneCompetitionStatePublisher } from '@/main/modules/mqtt/application/LaneCompetitionStatePublisher';
import type { IMqttClientService } from '@/main/modules/mqtt/infra/IMqttClientService';
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
  const store = new Map<string, unknown>([['mqtt.laneId', 'lane-uuid-123']]);
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

function createMockCompetition(): CompetitionState {
  return {
    id: 'comp-uuid-456',
    sessionId: 'session-uuid-789',
    phase: 'ACTIVE',
    currentStageIndex: 1,
    currentSeriesIndex: 0,
    seriesShotCount: 3,
    config: {
      name: 'Qualification',
      shotsPerSeries: 10,
      acc: 'DECIMAL',
      stages: [
        {
          name: 'Sighting',
          scored: false,
          series: [{ maxShots: 0 }],
        },
        {
          name: '1st Stage',
          scored: true,
          series: [{ maxShots: 10 }, { maxShots: 10 }, { maxShots: 10 }],
        },
      ],
    },
    timer: { totalSeconds: 0, remainingSeconds: 0, isRunning: false },
    startedAt: Date.now(),
    finishedAt: null,
  } as unknown as CompetitionState;
}

describe('LaneCompetitionStatePublisher', () => {
  let mqttClient: IMqttClientService;
  let eventBus: IEventBus;
  let storage: ILocalStorage;
  let competitionRepository: ICompetitionRepository;
  const mockCompetition = createMockCompetition();

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
    new LaneCompetitionStatePublisher(mqttClient, eventBus, storage, competitionRepository);
  });

  it('should subscribe to relevant events', () => {
    expect(eventBus.on).toHaveBeenCalledWith('PhaseChanged', expect.any(Function));
    expect(eventBus.on).toHaveBeenCalledWith('StageAdvanced', expect.any(Function));
    expect(eventBus.on).toHaveBeenCalledWith('SeriesCompleted', expect.any(Function));
    expect(eventBus.on).toHaveBeenCalledWith('CompetitionStarted', expect.any(Function));
    expect(eventBus.on).toHaveBeenCalledWith('CompetitionFinished', expect.any(Function));
  });

  it('should publish state on PhaseChanged event', async () => {
    (eventBus as { emit: Function }).emit({
      type: 'PhaseChanged',
      timestamp: Date.now(),
      aggregateId: 'comp-uuid-456',
      previousPhase: 'IDLE',
      newPhase: 'ACTIVE',
      stageIndex: 1,
      seriesIndex: 0,
      stageName: '1st Stage',
    });

    // Wait for async handler
    await vi.waitFor(() => {
      expect(mqttClient.publish).toHaveBeenCalled();
    });

    expect(mqttClient.publish).toHaveBeenCalledWith(
      'saika/competition/comp-uuid-456/lane/lane-uuid-123/state',
      expect.any(String),
      { qos: 1, retain: true },
    );
  });

  it('should include correct payload structure', async () => {
    (eventBus as { emit: Function }).emit({
      type: 'PhaseChanged',
      timestamp: Date.now(),
      aggregateId: 'comp-uuid-456',
      previousPhase: 'IDLE',
      newPhase: 'ACTIVE',
      stageIndex: 1,
      seriesIndex: 0,
      stageName: '1st Stage',
    });

    await vi.waitFor(() => {
      expect(mqttClient.publish).toHaveBeenCalled();
    });

    const payload = JSON.parse((mqttClient.publish as ReturnType<typeof vi.fn>).mock.calls[0]![1] as string);

    expect(payload.competitionId).toBe('comp-uuid-456');
    expect(payload.laneId).toBe('lane-uuid-123');
    expect(payload.sessionId).toBe('session-uuid-789');
    expect(payload.phase).toBe('MATCH');
    expect(payload.currentStage).toMatchObject({
      index: 1,
      name: '1st Stage',
      scored: true,
      totalSeries: 3,
    });
    expect(payload.currentSeries).toMatchObject({
      index: 0,
      shotsRecorded: 3,
      maxShots: 10,
    });
    expect(payload.publishedAt).toBeDefined();
  });

  it('should not publish when mqtt client is not connected', async () => {
    (mqttClient.isConnected as ReturnType<typeof vi.fn>).mockReturnValue(false);

    (eventBus as { emit: Function }).emit({
      type: 'PhaseChanged',
      timestamp: Date.now(),
      aggregateId: 'comp-uuid-456',
      previousPhase: 'IDLE',
      newPhase: 'ACTIVE',
      stageIndex: 1,
      seriesIndex: 0,
      stageName: '1st Stage',
    });

    await new Promise((r) => setTimeout(r, 10));
    expect(mqttClient.publish).not.toHaveBeenCalled();
  });

  it('should not publish when no active competition', async () => {
    (competitionRepository.findActive as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    (eventBus as { emit: Function }).emit({
      type: 'CompetitionStarted',
      timestamp: Date.now(),
      aggregateId: 'comp-uuid-456',
      competitionTypeId: 'BR60S',
      sessionId: 'session-uuid-789',
      config: {},
    });

    await new Promise((r) => setTimeout(r, 10));
    expect(mqttClient.publish).not.toHaveBeenCalled();
  });

  it('should publish on CompetitionFinished event', async () => {
    const finishedCompetition = {
      ...mockCompetition,
      phase: 'FINISHED' as const,
    };
    (competitionRepository.findActive as ReturnType<typeof vi.fn>).mockResolvedValue(finishedCompetition);

    (eventBus as { emit: Function }).emit({
      type: 'CompetitionFinished',
      timestamp: Date.now(),
      aggregateId: 'comp-uuid-456',
      sessionId: 'session-uuid-789',
    });

    await vi.waitFor(() => {
      expect(mqttClient.publish).toHaveBeenCalled();
    });

    const payload = JSON.parse((mqttClient.publish as ReturnType<typeof vi.fn>).mock.calls[0]![1] as string);
    expect(payload.phase).toBe('FINISHED');
  });
});
