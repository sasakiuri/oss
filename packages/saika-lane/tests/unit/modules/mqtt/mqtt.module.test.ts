// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import type { LaneTimerService } from '@/main/modules/competition/infra/LaneTimerService';
import type { ICompetitionInterruptionControl } from '@/main/modules/competition-interruption';
import type { ICompetitionShootOffControl } from '@/main/modules/competition-shoot-off';
import { mqttModule } from '@/main/modules/mqtt/mqtt.module';
import type {
  IQualificationRecoveryAdjudicationControl,
  IQualificationRecoveryControl,
  IQualificationRecoverySettlementControl,
} from '@/main/modules/qualification-recovery';
import type { ILaneSafetyStopControl } from '@/main/modules/safety-stop';
import type { ISessionRepository } from '@/main/modules/session/domain/ISessionRepository';
import type { IAppSettingsStore } from '@/main/modules/settings/application/IAppSettingsStore';
import type { ITimedTargetControl } from '@/main/modules/timed-target';
import { TimingProfileService, StoredTimingProfiles } from '@/main/modules/timing-profiles';
import type { CommandBus } from '@/main/shared-infra/cqrs/CommandBus';
import type { QueryBus } from '@/main/shared-infra/cqrs/QueryBus';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import type { IpcRouter } from '@/main/shared-infra/ipc/IpcRouter';
import { createSqliteDb } from '@/main/shared-infra/sqlite/SqliteDb';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

import { createMockSettingsStore } from '../../../helpers/mockDependencies';

const { mockMqttClient } = vi.hoisted(() => ({
  mockMqttClient: {
    connected: false,
    on: vi.fn(),
    removeListener: vi.fn(),
    removeAllListeners: vi.fn(),
    end: vi.fn(),
    publishAsync: vi.fn(),
    subscribeAsync: vi.fn(),
    unsubscribeAsync: vi.fn(),
  },
}));

// ── mock electron ──────────────────────────────────────────────
vi.mock('electron', () => ({
  app: { getVersion: () => '1.0.0-test' },
}));

// ── mock mqtt ──────────────────────────────────────────────────
vi.mock('mqtt', () => ({
  default: {
    connect: vi.fn(() => mockMqttClient),
  },
}));

// ── mock logger ────────────────────────────────────────────────
vi.mock('@/main/shared-infra/logging/createLogger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

function createMockEventBus(): IEventBus {
  return {
    emit: vi.fn(),
    on: vi.fn(() => () => {}),
  } as unknown as IEventBus;
}

function createMockIpcRouter(): IpcRouter {
  return {
    register: vi.fn(),
  } as unknown as IpcRouter;
}

function createMockStorage(): ILocalStorage {
  const store = new Map<string, unknown>([['mqtt.laneId', '11111111-1111-4111-8111-111111111111']]);
  return {
    get: vi.fn(<T>(key: string) => (store.get(key) as T) ?? (null as T)),
    set: vi.fn(),
    delete: vi.fn(),
    has: vi.fn((key: string) => store.has(key)),
  } as unknown as ILocalStorage;
}

function createMockCommandBus(): CommandBus {
  return {
    execute: vi.fn(),
    register: vi.fn(),
    use: vi.fn(),
  } as unknown as CommandBus;
}

function createMockQueryBus(): QueryBus {
  return {
    execute: vi.fn(),
    register: vi.fn(),
    use: vi.fn(),
  } as unknown as QueryBus;
}

function createMockCompetitionRepository(): ICompetitionRepository {
  return {
    save: vi.fn(),
    findById: vi.fn(),
    findBySessionId: vi.fn(),
    findActive: vi.fn().mockResolvedValue(null),
    delete: vi.fn(),
  };
}

function createMockTimerService(): LaneTimerService {
  return {
    start: vi.fn(),
    stop: vi.fn(),
    syncRemaining: vi.fn(),
  } as unknown as LaneTimerService;
}

function createMockSessionRepository(): ISessionRepository {
  return {
    save: vi.fn(),
    saveShot: vi.fn(),
    saveReset: vi.fn(),
    readResetEpoch: vi.fn().mockResolvedValue(null),
    findById: vi.fn().mockResolvedValue(null),
    findAll: vi.fn().mockResolvedValue([]),
    delete: vi.fn(),
    findActive: vi.fn().mockResolvedValue(null),
  };
}

function createMockInterruptionControl(): ICompetitionInterruptionControl {
  return {
    pause: vi.fn(),
    resume: vi.fn(),
    resumeMatch: vi.fn(),
    get: vi.fn().mockReturnValue(null),
    clear: vi.fn(),
  };
}

function createMockSafetyStopControl(): ILaneSafetyStopControl {
  return {
    activate: vi.fn(),
    clear: vi.fn(),
    getState: vi.fn().mockReturnValue(null),
    isStopped: vi.fn().mockReturnValue(false),
  };
}

describe('mqtt.module', () => {
  let eventBus: IEventBus;
  let ipcRouter: IpcRouter;
  let storage: ILocalStorage;
  let settingsStore: IAppSettingsStore;
  let commandBus: CommandBus;
  let queryBus: QueryBus;
  let competitionRepository: ICompetitionRepository;
  let timerService: LaneTimerService;
  let competitionInterruptionControl: ICompetitionInterruptionControl;
  let competitionShootOffControl: ICompetitionShootOffControl;
  let qualificationRecoveryControl: IQualificationRecoveryControl;
  let qualificationRecoveryAdjudicationControl: IQualificationRecoveryAdjudicationControl;
  let qualificationRecoverySettlementControl: IQualificationRecoverySettlementControl;
  let safetyStopControl: ILaneSafetyStopControl;
  let timedTargetControl: ITimedTargetControl;
  let sessionRepository: ISessionRepository;
  let database: ReturnType<typeof createSqliteDb>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockMqttClient.connected = false;
    mockMqttClient.end.mockImplementation((_force: boolean, _options: object, callback: (error?: Error) => void) => {
      mockMqttClient.connected = false;
      callback();
    });
    mockMqttClient.publishAsync.mockResolvedValue(undefined);
    mockMqttClient.subscribeAsync.mockResolvedValue(undefined);
    mockMqttClient.unsubscribeAsync.mockResolvedValue(undefined);
    eventBus = createMockEventBus();
    ipcRouter = createMockIpcRouter();
    storage = createMockStorage();
    settingsStore = createMockSettingsStore();
    commandBus = createMockCommandBus();
    queryBus = createMockQueryBus();
    competitionRepository = createMockCompetitionRepository();
    timerService = createMockTimerService();
    competitionInterruptionControl = createMockInterruptionControl();
    competitionShootOffControl = {
      open: vi.fn(),
      close: vi.fn(),
      getState: vi.fn().mockReturnValue(null),
      canAcceptShot: vi.fn().mockReturnValue(false),
      recordShot: vi.fn(),
    } as unknown as ICompetitionShootOffControl;
    qualificationRecoveryControl = {
      start: vi.fn(),
      cancel: vi.fn(),
      get: vi.fn().mockReturnValue(null),
      getLatest: vi.fn().mockReturnValue(null),
      restoreActive: vi.fn().mockReturnValue(null),
    };
    qualificationRecoveryAdjudicationControl = {
      apply: vi.fn(),
      get: vi.fn().mockReturnValue(null),
    };
    qualificationRecoverySettlementControl = {
      apply: vi.fn(),
      get: vi.fn().mockReturnValue(null),
    };
    safetyStopControl = createMockSafetyStopControl();
    timedTargetControl = {
      enforcementMode: 'REQUIRED',
      start: vi.fn(),
      cancel: vi.fn(),
      getState: vi.fn().mockReturnValue(null),
      tryAcceptShot: vi.fn(),
      restore: vi.fn(),
      dispose: vi.fn(),
    } as unknown as ITimedTargetControl;
    sessionRepository = createMockSessionRepository();
    database = createSqliteDb(':memory:');
  });

  afterEach(() => database.close());

  it('should have correct name', () => {
    expect(mqttModule.name).toBe('mqtt');
  });

  it('should declare correct dependencies', () => {
    expect(mqttModule.deps).toEqual([
      'eventBus',
      'ipcRouter',
      'storage',
      'settingsStore',
      'queryBus',
      'commandBus',
      'competitionRepository',
      'timerService',
      'competitionInterruptionControl',
      'competitionShootOffControl',
      'qualificationRecoveryControl',
      'qualificationRecoveryAdjudicationControl',
      'qualificationRecoverySettlementControl',
      'safetyStopControl',
      'timedTargetControl',
      'timingProfileService',
      'sessionRepository',
      'database',
    ]);
  });

  it('should register without errors', () => {
    expect(() => {
      mqttModule.register({
        eventBus,
        ipcRouter,
        storage,
        settingsStore,
        queryBus,
        commandBus,
        competitionRepository,
        timerService,
        competitionInterruptionControl,
        competitionShootOffControl,
        qualificationRecoveryControl,
        qualificationRecoveryAdjudicationControl,
        qualificationRecoverySettlementControl,
        safetyStopControl,
        timedTargetControl,
        timingProfileService: new TimingProfileService(new StoredTimingProfiles(storage), {
          connection: () => null,
          hasActiveCompetition: async () => false,
        }),
        sessionRepository,
        database,
      });
    }).not.toThrow();
  });

  it('should register IPC handlers via ipcRouter', () => {
    mqttModule.register({
      eventBus,
      ipcRouter,
      storage,
      settingsStore,
      queryBus,
      commandBus,
      competitionRepository,
      timerService,
      competitionInterruptionControl,
      competitionShootOffControl,
      qualificationRecoveryControl,
      qualificationRecoveryAdjudicationControl,
      qualificationRecoverySettlementControl,
      safetyStopControl,
      timedTargetControl,
      timingProfileService: new TimingProfileService(new StoredTimingProfiles(storage), {
        connection: () => null,
        hasActiveCompetition: async () => false,
      }),
      sessionRepository,
      database,
    });

    expect(ipcRouter.register).toHaveBeenCalledTimes(1);
    expect(ipcRouter.register).toHaveBeenCalledWith(expect.objectContaining({ namespace: 'mqtt' }), expect.any(Object));
  });

  it('should subscribe to ConnectionEstablished and ConnectionLost events', () => {
    mqttModule.register({
      eventBus,
      ipcRouter,
      storage,
      settingsStore,
      queryBus,
      commandBus,
      competitionRepository,
      timerService,
      competitionInterruptionControl,
      competitionShootOffControl,
      qualificationRecoveryControl,
      qualificationRecoveryAdjudicationControl,
      qualificationRecoverySettlementControl,
      safetyStopControl,
      timedTargetControl,
      timingProfileService: new TimingProfileService(new StoredTimingProfiles(storage), {
        connection: () => null,
        hasActiveCompetition: async () => false,
      }),
      sessionRepository,
      database,
    });

    expect(eventBus.on).toHaveBeenCalledWith('ConnectionEstablished', expect.any(Function));
    expect(eventBus.on).toHaveBeenCalledWith('ConnectionLost', expect.any(Function));
  });

  it('should subscribe to ShotRecorded event', () => {
    mqttModule.register({
      eventBus,
      ipcRouter,
      storage,
      settingsStore,
      queryBus,
      commandBus,
      competitionRepository,
      timerService,
      competitionInterruptionControl,
      competitionShootOffControl,
      qualificationRecoveryControl,
      qualificationRecoveryAdjudicationControl,
      qualificationRecoverySettlementControl,
      safetyStopControl,
      timedTargetControl,
      timingProfileService: new TimingProfileService(new StoredTimingProfiles(storage), {
        connection: () => null,
        hasActiveCompetition: async () => false,
      }),
      sessionRepository,
      database,
    });

    expect(eventBus.on).toHaveBeenCalledWith('ShotRecorded', expect.any(Function));
  });

  it('should publish offline and close the client when initial subscription fails', async () => {
    let emittedInitialConnect = false;
    mockMqttClient.on.mockImplementation((event: string, handler: Function) => {
      if (event === 'connect' && !emittedInitialConnect) {
        emittedInitialConnect = true;
        setTimeout(() => {
          mockMqttClient.connected = true;
          handler();
        }, 0);
      }
    });
    mockMqttClient.subscribeAsync.mockRejectedValueOnce(new Error('subscription rejected'));

    mqttModule.register({
      eventBus,
      ipcRouter,
      storage,
      settingsStore,
      queryBus,
      commandBus,
      competitionRepository,
      timerService,
      competitionInterruptionControl,
      competitionShootOffControl,
      qualificationRecoveryControl,
      qualificationRecoveryAdjudicationControl,
      qualificationRecoverySettlementControl,
      safetyStopControl,
      timedTargetControl,
      timingProfileService: new TimingProfileService(new StoredTimingProfiles(storage), {
        connection: () => null,
        hasActiveCompetition: async () => false,
      }),
      sessionRepository,
      database,
    });
    const handlers = vi.mocked(ipcRouter.register).mock.calls[0]?.[1] as unknown as {
      connectMqtt(input: { brokerUrl: string; laneAlias?: string; autoConnect?: boolean }): Promise<void>;
      getMqttStatus(): Promise<{ status: string }>;
    };

    await expect(
      handlers.connectMqtt({ brokerUrl: 'mqtt://localhost:1883', laneAlias: 'Lane 4' }),
    ).rejects.toMatchObject({ code: 'MQTT_SUBSCRIBE_FAILED' });

    expect(mockMqttClient.publishAsync).toHaveBeenCalledWith(
      'saika/lane/11111111-1111-4111-8111-111111111111/hardware/state',
      expect.stringContaining('"status":"offline"'),
      { qos: 1, retain: true },
    );
    expect(mockMqttClient.end).toHaveBeenCalledWith(false, {}, expect.any(Function));
    await expect(handlers.getMqttStatus()).resolves.toMatchObject({ status: 'disconnected' });
  });
});
