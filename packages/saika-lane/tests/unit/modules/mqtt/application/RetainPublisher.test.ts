// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import type { HardwareStatePublisher } from '@/main/modules/mqtt/application/HardwareStatePublisher';
import type { LaneCompetitionStatePublisher } from '@/main/modules/mqtt/application/LaneCompetitionStatePublisher';
import type { LaneScorePublisher } from '@/main/modules/mqtt/application/LaneScorePublisher';
import { RetainPublisher } from '@/main/modules/mqtt/application/RetainPublisher';
import type { IMqttClientService } from '@/main/modules/mqtt/infra/IMqttClientService';
import { ImpactPoint } from '@/main/modules/session/domain/ImpactPoint';
import type { ISessionRepository } from '@/main/modules/session/domain/ISessionRepository';
import { Mode } from '@/main/modules/session/domain/Mode';
import { Score } from '@/main/modules/session/domain/Score';
import { Shot } from '@/main/modules/session/domain/Shot';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

// ── mock logger ────────────────────────────────────────────────
const mockLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() };
vi.mock('@/main/shared-infra/logging/createLogger', () => ({
  getLogger: () => mockLogger,
}));

function createMockMqttClient(): IMqttClientService {
  const connectHandlers: Function[] = [];
  const disconnectHandlers: Function[] = [];
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    publish: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    setWill: vi.fn(),
    onMessage: vi.fn().mockReturnValue(() => {}),
    onConnect: vi.fn((handler: Function) => {
      connectHandlers.push(handler);
    }),
    onDisconnect: vi.fn((handler: Function) => {
      disconnectHandlers.push(handler);
    }),
    isConnected: vi.fn().mockReturnValue(true),
    // Test helpers
    _triggerConnect: () => connectHandlers.forEach((h) => h()),
    _triggerDisconnect: () => disconnectHandlers.forEach((h) => h()),
  } as unknown as IMqttClientService & { _triggerConnect: () => void; _triggerDisconnect: () => void };
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

function createTestShot(timestamp: Date, shotNumber: number): Shot {
  return Shot.create({
    impactPoint: new ImpactPoint(1.0, -1.0),
    score: new Score(102),
    mode: Mode.match(),
    timestamp,
    shotNumber,
    seriesNumber: 1,
    innerTen: false,
  });
}

function createMockSession(shots: Shot[]) {
  return {
    id: 'session-uuid',
    allShots: shots,
  };
}

describe('RetainPublisher', () => {
  let mqttClient: IMqttClientService & { _triggerConnect: () => void; _triggerDisconnect: () => void };
  let storage: ILocalStorage;
  let competitionRepository: ICompetitionRepository;
  let sessionRepository: ISessionRepository;
  let hardwarePublisher: HardwareStatePublisher;
  let competitionStatePublisher: LaneCompetitionStatePublisher;
  let scorePublisher: LaneScorePublisher;
  let retainPublisher: RetainPublisher;

  beforeEach(() => {
    vi.clearAllMocks();
    mqttClient = createMockMqttClient() as IMqttClientService & {
      _triggerConnect: () => void;
      _triggerDisconnect: () => void;
    };
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
      findById: vi.fn().mockResolvedValue(null),
      findAll: vi.fn().mockResolvedValue([]),
      delete: vi.fn(),
      findActive: vi.fn().mockResolvedValue(null),
    };
    hardwarePublisher = {
      publishState: vi.fn(),
    } as unknown as HardwareStatePublisher;
    competitionStatePublisher = {
      publishCurrentState: vi.fn(),
    } as unknown as LaneCompetitionStatePublisher;
    scorePublisher = {
      publishCurrentScore: vi.fn(),
    } as unknown as LaneScorePublisher;

    retainPublisher = new RetainPublisher(
      mqttClient,
      storage,
      competitionRepository,
      sessionRepository,
      hardwarePublisher,
      competitionStatePublisher,
      scorePublisher,
    );
    retainPublisher.registerCallbacks();
  });

  it('should register onConnect and onDisconnect callbacks', () => {
    expect(mqttClient.onConnect).toHaveBeenCalled();
    expect(mqttClient.onDisconnect).toHaveBeenCalled();
  });

  it('should NOT republish on initial connect', () => {
    mqttClient._triggerConnect();

    expect(hardwarePublisher.publishState).not.toHaveBeenCalled();
    expect(competitionStatePublisher.publishCurrentState).not.toHaveBeenCalled();
  });

  it('should republish all retain topics on reconnect', async () => {
    // Initial connect
    mqttClient._triggerConnect();

    // Disconnect
    mqttClient._triggerDisconnect();

    // Reconnect
    mqttClient._triggerConnect();

    await vi.waitFor(() => {
      expect(hardwarePublisher.publishState).toHaveBeenCalled();
    });

    expect(competitionStatePublisher.publishCurrentState).toHaveBeenCalled();
    expect(scorePublisher.publishCurrentScore).toHaveBeenCalled();
  });

  it('should replay backlog shots with isReplay=true on reconnect', async () => {
    const disconnectTime = new Date('2026-02-24T12:00:00Z');
    const shot1 = createTestShot(new Date('2026-02-24T12:01:00Z'), 1);
    const shot2 = createTestShot(new Date('2026-02-24T12:02:00Z'), 2);
    const oldShot = createTestShot(new Date('2026-02-24T11:50:00Z'), 3);
    const session = createMockSession([oldShot, shot1, shot2]);

    (sessionRepository.findById as ReturnType<typeof vi.fn>).mockResolvedValue(session);

    // Set state for reconnect scenario
    (retainPublisher as unknown as { disconnectedAt: Date }).disconnectedAt = disconnectTime;
    (retainPublisher as unknown as { isInitialConnect: boolean }).isInitialConnect = false;

    await retainPublisher.republish();

    // Should publish 2 shots (after disconnectTime), not the old one
    const publishCalls = (mqttClient.publish as ReturnType<typeof vi.fn>).mock.calls;
    const shotPublishes = publishCalls.filter((call: unknown[]) => (call[0] as string).includes('/shot'));

    expect(shotPublishes).toHaveLength(2);

    const payload1 = JSON.parse(shotPublishes[0]![1] as string);
    expect(payload1.isReplay).toBe(true);
    expect(payload1.shotId).toBe(shot1.id);

    const payload2 = JSON.parse(shotPublishes[1]![1] as string);
    expect(payload2.isReplay).toBe(true);
    expect(payload2.shotId).toBe(shot2.id);
  });

  it('should send shots in timestamp ascending order', async () => {
    const disconnectTime = new Date('2026-02-24T12:00:00Z');
    const laterShot = createTestShot(new Date('2026-02-24T12:05:00Z'), 1);
    const earlierShot = createTestShot(new Date('2026-02-24T12:01:00Z'), 2);
    // Shots added in reverse order
    const session = createMockSession([laterShot, earlierShot]);

    (sessionRepository.findById as ReturnType<typeof vi.fn>).mockResolvedValue(session);
    (retainPublisher as unknown as { disconnectedAt: Date }).disconnectedAt = disconnectTime;
    (retainPublisher as unknown as { isInitialConnect: boolean }).isInitialConnect = false;

    await retainPublisher.republish();

    const publishCalls = (mqttClient.publish as ReturnType<typeof vi.fn>).mock.calls;
    const shotPublishes = publishCalls.filter((call: unknown[]) => (call[0] as string).includes('/shot'));

    expect(shotPublishes).toHaveLength(2);
    const p1 = JSON.parse(shotPublishes[0]![1] as string);
    const p2 = JSON.parse(shotPublishes[1]![1] as string);

    // Earlier shot should come first
    expect(new Date(p1.timestamp).getTime()).toBeLessThan(new Date(p2.timestamp).getTime());
  });

  it('should publish competition state twice (before and after replay) as completion signal', async () => {
    const disconnectTime = new Date('2026-02-24T12:00:00Z');
    const shot = createTestShot(new Date('2026-02-24T12:01:00Z'), 1);
    const session = createMockSession([shot]);

    (sessionRepository.findById as ReturnType<typeof vi.fn>).mockResolvedValue(session);
    (retainPublisher as unknown as { disconnectedAt: Date }).disconnectedAt = disconnectTime;
    (retainPublisher as unknown as { isInitialConnect: boolean }).isInitialConnect = false;

    await retainPublisher.republish();

    // publishCurrentState called twice: once before replay, once after as completion signal
    expect(competitionStatePublisher.publishCurrentState).toHaveBeenCalledTimes(2);
  });

  it('should not replay when no active competition', async () => {
    (competitionRepository.findActive as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (retainPublisher as unknown as { disconnectedAt: Date }).disconnectedAt = new Date();
    (retainPublisher as unknown as { isInitialConnect: boolean }).isInitialConnect = false;

    await retainPublisher.republish();

    expect(hardwarePublisher.publishState).toHaveBeenCalled();
    expect(competitionStatePublisher.publishCurrentState).not.toHaveBeenCalled();
    expect(mqttClient.publish).not.toHaveBeenCalled();
  });

  it('should not replay when no session found', async () => {
    (sessionRepository.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (retainPublisher as unknown as { disconnectedAt: Date }).disconnectedAt = new Date();
    (retainPublisher as unknown as { isInitialConnect: boolean }).isInitialConnect = false;

    await retainPublisher.republish();

    // State publishers called but no shot publish
    expect(hardwarePublisher.publishState).toHaveBeenCalled();
    expect(competitionStatePublisher.publishCurrentState).toHaveBeenCalled();
    const shotPublishes = (mqttClient.publish as ReturnType<typeof vi.fn>).mock.calls.filter((call: unknown[]) =>
      (call[0] as string).includes('/shot'),
    );
    expect(shotPublishes).toHaveLength(0);
  });

  it('should clear disconnectedAt after republish', async () => {
    (retainPublisher as unknown as { disconnectedAt: Date }).disconnectedAt = new Date();
    (retainPublisher as unknown as { isInitialConnect: boolean }).isInitialConnect = false;

    await retainPublisher.republish();

    expect((retainPublisher as unknown as { disconnectedAt: Date | null }).disconnectedAt).toBeNull();
  });
});
