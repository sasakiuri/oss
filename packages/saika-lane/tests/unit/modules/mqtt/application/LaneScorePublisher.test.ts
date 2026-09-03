// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GetSessionScoreToken, GetShotHistoryToken } from '@/main/composition/tokens';
import type { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import { P25_FINAL } from '@/main/modules/competition/domain/competitionTypes';
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
  let publisher: LaneScorePublisher;

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
      execute: vi.fn((token) => {
        if (token === GetSessionScoreToken) {
          return Promise.resolve({
            sessionId: 'session-uuid',
            totalScore: 1055,
            seriesScores: [1000, 1055],
            shotCount: 15,
            discipline: 'BEAM_RIFLE_10M',
            mode: 'MATCH',
          });
        }
        if (token === GetShotHistoryToken) {
          return Promise.resolve({
            sessionId: 'session-uuid',
            shots: [
              {
                id: 'sighting-shot',
                shotNumber: 1,
                seriesNumber: 0,
                x: 0,
                y: 0,
                score: 90,
                innerTen: false,
                timestamp: '2026-02-24T11:59:00.000Z',
                mode: 'SIGHTING',
                isRecorded: false,
              },
              {
                id: 'match-shot-1',
                shotNumber: 2,
                seriesNumber: 1,
                x: 0,
                y: 0,
                score: 1000,
                innerTen: false,
                timestamp: '2026-02-24T12:00:00.000Z',
                mode: 'MATCH',
                isRecorded: true,
              },
              {
                id: 'match-shot-2',
                shotNumber: 3,
                seriesNumber: 2,
                x: 0,
                y: 0,
                score: 1055,
                innerTen: true,
                timestamp: '2026-02-24T12:01:00.000Z',
                mode: 'MATCH',
                isRecorded: true,
              },
            ],
          });
        }
        throw new Error('Unexpected query token');
      }),
      use: vi.fn(),
    } as unknown as QueryBus;

    publisher = new LaneScorePublisher(mqttClient, eventBus, storage, competitionRepository, queryBus);
  });

  it('should subscribe to ShotRecorded events', () => {
    expect(eventBus.on).toHaveBeenCalledWith('ShotRecorded', expect.any(Function));
  });

  it('should subscribe to SessionReset events', () => {
    expect(eventBus.on).toHaveBeenCalledWith('SessionReset', expect.any(Function));
  });

  it('should republish the retained score after SessionReset', async () => {
    (eventBus as { emit: Function }).emit({
      type: 'SessionReset',
      timestamp: Date.now(),
      aggregateId: 'session-uuid',
    });

    await vi.waitFor(() => {
      expect(mqttClient.publish).toHaveBeenCalledWith(
        'saika/competition/comp-uuid/lane/lane-uuid/score',
        expect.any(String),
        { qos: 1, retain: true },
      );
    });
  });

  it('should report a retained score publication failure to command callers', async () => {
    vi.mocked(mqttClient.publish).mockRejectedValueOnce(new Error('broker unavailable'));

    await expect(publisher.publishCurrentScore()).rejects.toThrow('broker unavailable');
  });

  it('serializes retained score publications', async () => {
    let resolveFirst!: () => void;
    vi.mocked(mqttClient.publish).mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveFirst = resolve;
      }),
    );

    const first = publisher.publishCurrentScore();
    const second = publisher.publishCurrentScore();
    await vi.waitFor(() => {
      expect(mqttClient.publish).toHaveBeenCalledTimes(1);
    });
    expect(competitionRepository.findActive).toHaveBeenCalledTimes(1);

    resolveFirst();
    await Promise.all([first, second]);

    expect(mqttClient.publish).toHaveBeenCalledTimes(2);
    expect(competitionRepository.findActive).toHaveBeenCalledTimes(2);
  });

  it('publishes a finished competition score by ID after it is no longer active', async () => {
    vi.mocked(competitionRepository.findActive).mockResolvedValue(null);
    vi.mocked(competitionRepository.findById).mockResolvedValue(mockCompetition);

    await publisher.publishCurrentScore('comp-uuid');

    expect(competitionRepository.findById).toHaveBeenCalledWith('comp-uuid');
    expect(mqttClient.publish).toHaveBeenCalled();
  });

  it('tags a final score snapshot with the finish command ID', async () => {
    const commandId = 'c3333333-3333-4333-a333-333333333333';
    vi.mocked(competitionRepository.findById).mockResolvedValue(mockCompetition);

    await publisher.publishCurrentScore('comp-uuid', commandId);

    const payload = JSON.parse(vi.mocked(mqttClient.publish).mock.calls[0]![1] as string) as Record<string, unknown>;
    expect(payload.finalSnapshotCommandId).toBe(commandId);
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
    expect(payload.stages[0].series).toEqual([
      expect.objectContaining({ seriesIndex: 0, shots: [1000] }),
      expect.objectContaining({ seriesIndex: 1, shots: [1055] }),
      expect.objectContaining({ seriesIndex: 2, shots: [] }),
    ]);
    expect(payload.publishedAt).toBeDefined();
  });

  it('marks the current series complete as soon as it reaches its shot limit', async () => {
    vi.mocked(queryBus.execute).mockImplementation((token) => {
      if (token === GetSessionScoreToken) {
        return Promise.resolve({
          sessionId: 'session-uuid',
          totalScore: 3000,
          seriesScores: [1000, 1000, 1000],
          shotCount: 30,
          discipline: 'BEAM_RIFLE_10M',
          mode: 'MATCH',
        });
      }
      if (token === GetShotHistoryToken) {
        return Promise.resolve({
          sessionId: 'session-uuid',
          shots: Array.from({ length: 10 }, (_, index) => ({
            id: `match-shot-${index + 1}`,
            shotNumber: index + 21,
            seriesNumber: 3,
            x: 0,
            y: 0,
            score: 100,
            innerTen: false,
            timestamp: `2026-02-24T12:00:${String(index).padStart(2, '0')}.000Z`,
            mode: 'MATCH',
            isRecorded: true,
          })),
        });
      }
      throw new Error('Unexpected query token');
    });

    await publisher.publishCurrentScore();

    const payload = JSON.parse(vi.mocked(mqttClient.publish).mock.calls[0]![1] as string) as {
      stages: Array<{ series: Array<{ isComplete: boolean }> }>;
    };
    expect(payload.stages[0]?.series[2]?.isComplete).toBe(true);
  });

  it('publishes HIT/MISS result scores while preserving decimal source evidence', async () => {
    vi.mocked(competitionRepository.findActive).mockResolvedValue({
      ...mockCompetition,
      config: P25_FINAL.config,
    } as unknown as CompetitionState);
    vi.mocked(queryBus.execute).mockImplementation((token) => {
      if (token === GetSessionScoreToken) {
        return Promise.resolve({
          sessionId: 'session-uuid',
          totalScore: 409,
          seriesScores: [409],
          shotCount: 5,
          discipline: 'PISTOL_25M',
          mode: 'MATCH',
        });
      }
      if (token === GetShotHistoryToken) {
        return Promise.resolve({
          sessionId: 'session-uuid',
          shots: [102, 101, 109, 97, 0].map((score, index) => ({
            id: `final-shot-${index + 1}`,
            shotNumber: index + 1,
            seriesNumber: 1,
            x: 0,
            y: 0,
            score,
            innerTen: false,
            timestamp: `2026-02-24T12:00:0${index}.000Z`,
            mode: 'MATCH',
            isRecorded: true,
          })),
        });
      }
      throw new Error('Unexpected query token');
    });

    await publisher.publishCurrentScore();

    const payload = JSON.parse(vi.mocked(mqttClient.publish).mock.calls[0]![1] as string) as {
      totalScoreX10: number;
      sourceTotalScoreX10: number;
      resultProjection: { type: string; hitThresholdX10: number };
      stages: Array<{
        sourceStageTotalX10: number;
        series: Array<{
          shots: number[];
          seriesTotalX10: number;
          sourceShotsX10: number[];
          sourceSeriesTotalX10: number;
        }>;
      }>;
    };
    expect(payload.totalScoreX10).toBe(20);
    expect(payload.sourceTotalScoreX10).toBe(409);
    expect(payload.resultProjection).toMatchObject({ type: 'HIT_MISS', hitThresholdX10: 102 });
    expect(payload.stages[0]?.sourceStageTotalX10).toBe(409);
    expect(payload.stages[0]?.series[0]).toMatchObject({
      shots: [10, 0, 10, 0, 0],
      seriesTotalX10: 20,
      sourceShotsX10: [102, 101, 109, 97, 0],
      sourceSeriesTotalX10: 409,
    });
  });

  it('does not consume a score-series number for a position-change sighting interval', async () => {
    vi.mocked(competitionRepository.findActive).mockResolvedValue({
      ...mockCompetition,
      config: {
        ...mockCompetition.config,
        stages: [
          { name: 'Preparation', scored: false, series: [{ maxShots: 0 }] },
          {
            name: 'Kneeling and Prone',
            scored: true,
            series: [{ maxShots: 10 }, { maxShots: 10 }, { maxShots: 0, purpose: 'POSITION_CHANGE_AND_SIGHTING' }],
          },
          { name: 'Standing', scored: true, series: [{ maxShots: 5 }] },
        ],
      },
    } as unknown as CompetitionState);
    vi.mocked(queryBus.execute).mockImplementation((token) => {
      if (token === GetSessionScoreToken) {
        return Promise.resolve({
          sessionId: 'session-uuid',
          totalScore: 600,
          seriesScores: [100, 200, 300],
          shotCount: 3,
          discipline: 'RIFLE_50M',
          mode: 'MATCH',
        });
      }
      if (token === GetShotHistoryToken) {
        return Promise.resolve({
          sessionId: 'session-uuid',
          shots: [1, 2, 3].map((seriesNumber) => ({
            id: `match-shot-${seriesNumber}`,
            shotNumber: seriesNumber,
            seriesNumber,
            x: 0,
            y: 0,
            score: seriesNumber * 100,
            innerTen: false,
            timestamp: '2026-02-24T12:00:00.000Z',
            mode: 'MATCH',
            isRecorded: true,
          })),
        });
      }
      throw new Error('Unexpected query token');
    });

    await publisher.publishCurrentScore();

    const payload = JSON.parse(vi.mocked(mqttClient.publish).mock.calls[0]![1] as string) as {
      stages: Array<{ series: Array<{ seriesIndex: number; shots: number[] }> }>;
    };
    expect(payload.stages[0]?.series).toEqual([
      expect.objectContaining({ seriesIndex: 0, shots: [100] }),
      expect.objectContaining({ seriesIndex: 1, shots: [200] }),
    ]);
    expect(payload.stages[1]?.series).toEqual([expect.objectContaining({ seriesIndex: 0, shots: [300] })]);
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
