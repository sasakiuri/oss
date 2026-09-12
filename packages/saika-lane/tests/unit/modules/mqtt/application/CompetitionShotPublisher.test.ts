// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import type { ICompetitionShootOffControl } from '@/main/modules/competition-shoot-off';
import { CompetitionShotPublisher } from '@/main/modules/mqtt/application/CompetitionShotPublisher';
import type { IMqttClientService } from '@/main/modules/mqtt/domain/IMqttClientService';
import { ImpactPoint } from '@/main/modules/session/domain/ImpactPoint';
import type { ISessionRepository } from '@/main/modules/session/domain/ISessionRepository';
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

function createMatchShot(): Shot {
  return Shot.create({
    impactPoint: new ImpactPoint(2.5, -1.3),
    score: new Score(102),
    mode: Mode.match(),
    timestamp: new Date('2026-02-24T12:00:00Z'),
    shotNumber: 5,
    seriesNumber: 3,
    competitionContext: { competitionId: 'comp-uuid', stageIndex: 1, seriesIndex: 2 },
    innerTen: false,
    deviceScore: new Score(100),
    calculatedScore: new Score(103),
    receivedAt: new Date('2026-02-24T12:00:00.040Z'),
    sourceObservationId: '11111111-1111-4111-8111-111111111111',
    targetProfileId: 'ISSF_PISTOL_25M_PRECISION_2026',
    scoringGaugeProfileId: 'ISSF_CENTER_FIRE_9_65_2026',
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
    competitionContext: { competitionId: 'comp-uuid', stageIndex: 0, seriesIndex: 0 },
    innerTen: false,
  });
}

describe('CompetitionShotPublisher', () => {
  let mqttClient: IMqttClientService;
  let eventBus: IEventBus;
  let storage: ILocalStorage;
  let competitionRepository: ICompetitionRepository;
  let sessionRepository: ISessionRepository;
  let shootOffControl: Pick<ICompetitionShootOffControl, 'getState' | 'canAcceptShot'>;

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
    sessionRepository = {
      save: vi.fn(),
      saveShot: vi.fn(),
      saveReset: vi.fn(),
      readResetEpoch: vi.fn().mockResolvedValue(null),
      findById: vi.fn(
        async () => ({ allShots: [(vi.mocked(eventBus.emit).mock.lastCall![0] as ShotRecordedEvent).shot] }) as never,
      ),
      findAll: vi.fn().mockResolvedValue([]),
      delete: vi.fn(),
      findActive: vi.fn().mockResolvedValue(null),
    };
    shootOffControl = {
      getState: vi.fn().mockReturnValue(null),
      canAcceptShot: vi.fn().mockReturnValue(false),
    };
    new CompetitionShotPublisher(
      mqttClient,
      eventBus,
      storage,
      competitionRepository,
      sessionRepository,
      shootOffControl,
    );
  });

  it('should subscribe to ShotRecorded events', () => {
    expect(eventBus.on).toHaveBeenCalledWith('ShotRecorded', expect.any(Function));
  });

  it('should publish shot with competition context', async () => {
    const shot = createMatchShot();
    const event: ShotRecordedEvent = {
      type: 'ShotRecorded',
      timestamp: Date.now(),
      aggregateId: 'session-uuid',
      shot,
      scoringMode: 'DECIMAL',
    };

    (eventBus as { emit: Function }).emit(event);

    await vi.waitFor(() => {
      expect(mqttClient.publish).toHaveBeenCalled();
    });

    expect(mqttClient.publish).toHaveBeenCalledWith(
      'saika/competition/comp-uuid/lane/lane-uuid/shot',
      expect.any(String),
      { qos: 1, retain: false },
    );
  });

  it('leaves an isolated acquisition to its owning publisher', async () => {
    const event: ShotRecordedEvent = {
      type: 'ShotRecorded',
      timestamp: Date.now(),
      aggregateId: 'session-uuid',
      shot: createSightingShot(),
      scoringMode: 'DECIMAL',
      acquisitionContext: {
        shotDisposition: 'ISOLATED',
        owner: 'qualification-recovery',
        referenceId: 'recovery-run-1',
      },
    };

    (eventBus as { emit: Function }).emit(event);
    await Promise.resolve();

    expect(competitionRepository.findActive).not.toHaveBeenCalled();
    expect(mqttClient.publish).not.toHaveBeenCalled();
  });

  it('should include correct payload fields', async () => {
    const shot = createMatchShot();
    const event: ShotRecordedEvent = {
      type: 'ShotRecorded',
      timestamp: Date.now(),
      aggregateId: 'session-uuid',
      shot,
      scoringMode: 'DECIMAL',
    };

    (eventBus as { emit: Function }).emit(event);

    await vi.waitFor(() => {
      expect(mqttClient.publish).toHaveBeenCalled();
    });

    const payload = JSON.parse((mqttClient.publish as ReturnType<typeof vi.fn>).mock.calls[0]![1] as string);

    expect(payload.laneId).toBe('lane-uuid');
    expect(payload.shotId).toBe(shot.id);
    expect(payload.x).toBe(2.5);
    expect(payload.y).toBe(-1.3);
    expect(payload.rawScoreX10).toBe(102);
    expect(payload.deviceScoreX10).toBe(100);
    expect(payload.calculatedScoreX10).toBe(103);
    expect(payload.effectiveScoreX10).toBe(102);
    expect(payload.receivedAt).toBe('2026-02-24T12:00:00.040Z');
    expect(payload.observationId).toBe('11111111-1111-4111-8111-111111111111');
    expect(payload.targetProfileId).toBe('ISSF_PISTOL_25M_PRECISION_2026');
    expect(payload.scoringGaugeProfileId).toBe('ISSF_CENTER_FIRE_9_65_2026');
    expect(payload.innerTen).toBe(false);
    expect(payload.mode).toBe('MATCH');
    expect(payload.competitionId).toBe('comp-uuid');
    expect(payload.sessionId).toBe('session-uuid');
    expect(payload.stageIndex).toBe(1);
    expect(payload.scored).toBe(true);
    expect(payload.seriesIndex).toBe(2);
    expect(payload.shotNumberInSeries).toBe(1);
    expect(payload.isRecorded).toBe(true);
    expect(payload.isReplay).toBe(false);
    expect(payload.publishedAt).toBeDefined();
  });

  it('derives shotNumberInSeries from persisted history', async () => {
    const earlier = Shot.create({
      impactPoint: null,
      score: new Score(100),
      mode: Mode.match(),
      timestamp: new Date('2026-02-24T11:59:59Z'),
      shotNumber: 4,
      seriesNumber: 3,
      competitionContext: { competitionId: 'comp-uuid', stageIndex: 1, seriesIndex: 2 },
      innerTen: false,
    });
    const shot = createMatchShot();
    vi.mocked(sessionRepository.findById).mockResolvedValue({ allShots: [earlier, shot] } as never);

    (eventBus as { emit: Function }).emit({
      type: 'ShotRecorded',
      timestamp: Date.now(),
      aggregateId: 'session-uuid',
      shot,
      scoringMode: 'DECIMAL',
    } satisfies ShotRecordedEvent);

    await vi.waitFor(() => expect(mqttClient.publish).toHaveBeenCalled());
    const payload = JSON.parse((mqttClient.publish as ReturnType<typeof vi.fn>).mock.calls[0]![1] as string);
    expect(payload.seriesIndex).toBe(2);
    expect(payload.shotNumberInSeries).toBe(2);
  });

  it('should set isRecorded=false for SIGHTING shots in match stage', async () => {
    const shot = createSightingShot();
    const event: ShotRecordedEvent = {
      type: 'ShotRecorded',
      timestamp: Date.now(),
      aggregateId: 'session-uuid',
      shot,
      scoringMode: 'DECIMAL',
    };

    (eventBus as { emit: Function }).emit(event);

    await vi.waitFor(() => {
      expect(mqttClient.publish).toHaveBeenCalled();
    });

    const payload = JSON.parse((mqttClient.publish as ReturnType<typeof vi.fn>).mock.calls[0]![1] as string);
    expect(payload.isRecorded).toBe(false);
    expect(payload.mode).toBe('SIGHTING');
  });

  it('does not publish a shot owned by an active shoot-off window', async () => {
    const shot = createSightingShot();
    vi.mocked(shootOffControl.getState).mockReturnValue({
      competitionId: mockCompetition.id,
      runId: '11111111-1111-4111-8111-111111111111',
      iteration: 1,
      timerStartAt: '2026-02-24T11:59:59.000Z',
      timerDurationSeconds: 50,
      shotsPerLane: 1,
      status: 'COMPLETE',
      recordedShotIds: [shot.id],
    });

    (eventBus as { emit: Function }).emit({
      type: 'ShotRecorded',
      timestamp: Date.now(),
      aggregateId: 'session-uuid',
      shot,
      scoringMode: 'DECIMAL',
    } satisfies ShotRecordedEvent);

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(mqttClient.publish).not.toHaveBeenCalled();
  });

  it('should set isRecorded=false for MATCH shots in preparation stage', async () => {
    const prepCompetition = {
      ...mockCompetition,
      currentStageIndex: 0,
    };
    (competitionRepository.findActive as ReturnType<typeof vi.fn>).mockResolvedValue(prepCompetition);

    const shot = Shot.reconstruct({
      ...createMatchShot(),
      competitionContext: { competitionId: 'comp-uuid', stageIndex: 0, seriesIndex: 0 },
    });
    const event: ShotRecordedEvent = {
      type: 'ShotRecorded',
      timestamp: Date.now(),
      aggregateId: 'session-uuid',
      shot,
      scoringMode: 'DECIMAL',
    };

    (eventBus as { emit: Function }).emit(event);

    await vi.waitFor(() => {
      expect(mqttClient.publish).toHaveBeenCalled();
    });

    const payload = JSON.parse((mqttClient.publish as ReturnType<typeof vi.fn>).mock.calls[0]![1] as string);
    expect(payload.isRecorded).toBe(false);
    expect(payload.scored).toBe(false);
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

  it('should log error when publish fails', async () => {
    vi.useFakeTimers();
    (mqttClient.publish as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('publish error'));

    const event: ShotRecordedEvent = {
      type: 'ShotRecorded',
      timestamp: Date.now(),
      aggregateId: 'session-uuid',
      shot: createMatchShot(),
      scoringMode: 'DECIMAL',
    };

    (eventBus as { emit: Function }).emit(event);

    await vi.advanceTimersByTimeAsync(10);

    expect(mockLogger.error).toHaveBeenCalledWith(
      '[CompetitionShotPublisher] Failed to publish shot',
      'mqtt',
      expect.objectContaining({ error: 'publish error' }),
    );
    vi.useRealTimers();
  });
});
