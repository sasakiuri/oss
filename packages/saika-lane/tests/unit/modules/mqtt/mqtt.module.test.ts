// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import { BR60S } from '@/main/modules/competition/domain/competitionTypes';
import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import type { LaneTimerService } from '@/main/modules/competition/infra/LaneTimerService';
import type { ICompetitionInterruptionControl } from '@/main/modules/competition-interruption';
import type { ICompetitionShootOffControl } from '@/main/modules/competition-shoot-off';
import { DirectorMembership } from '@/main/modules/mqtt/application/DirectorMembership';
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

import { buildSession } from '../../../helpers/factories';
import { createMockStartup, createMockSettingsStore } from '../../../helpers/mockDependencies';

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
      'membership',
      'startup',
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

  it('queries persisted membership before MQTT connects', async () => {
    vi.mocked(storage.get).mockImplementation((key) => (key === 'mqtt.competitionId' ? 'competition-1' : undefined));
    mqttModule.register({
      eventBus,
      ipcRouter,
      storage,
      settingsStore,
      queryBus,
      startup: createMockStartup(),
      membership: new DirectorMembership(storage, eventBus),
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
    const handlers = vi.mocked(ipcRouter.register).mock.calls[0]![1] as unknown as {
      getDirectorMembership(): Promise<{ competitionId: string | null; revision: number }>;
    };
    await expect(handlers.getDirectorMembership()).resolves.toEqual({ competitionId: 'competition-1', revision: 0 });
    expect(mockMqttClient.subscribeAsync).not.toHaveBeenCalled();
  });

  it('should register without errors', () => {
    expect(() => {
      mqttModule.register({
        eventBus,
        ipcRouter,
        storage,
        settingsStore,
        queryBus,
        startup: createMockStartup(),
        membership: new DirectorMembership(storage, eventBus),
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
      startup: createMockStartup(),
      membership: new DirectorMembership(storage, eventBus),
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
      startup: createMockStartup(),
      membership: new DirectorMembership(storage, eventBus),
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
      startup: createMockStartup(),
      membership: new DirectorMembership(storage, eventBus),
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

  it.each([
    [false, true],
    [true, false],
    [true, true],
  ])(
    'auto-connects after READY only when enabled=%s and autoConnect=%s, sharing a button connect',
    async (enabled, autoConnect) => {
      const startup = createMockStartup();
      settingsStore.saveMqttSettings({
        ...settingsStore.getMqttSettings(),
        enabled: enabled!,
        autoConnect: autoConnect!,
        brokerUrl: 'mqtt://localhost:1883',
      });
      mockMqttClient.on.mockReset();
      mqttModule.register({
        eventBus,
        ipcRouter,
        storage,
        settingsStore,
        queryBus,
        startup,
        membership: new DirectorMembership(storage, eventBus),
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
      expect(mockMqttClient.on).not.toHaveBeenCalled();
      const afterReady = vi.mocked(startup.afterReady).mock.calls[0]![0];
      const automatic = afterReady();
      expect(mockMqttClient.on.mock.calls.some(([event]) => event === 'connect')).toBe(enabled && autoConnect);
      if (!enabled || !autoConnect) {
        await automatic;
        return;
      }
      const handlers = vi.mocked(ipcRouter.register).mock.calls[0]![1] as unknown as {
        connectMqtt(input: { brokerUrl: string; autoConnect?: boolean }): Promise<void>;
        disconnectMqtt(): Promise<void>;
      };
      const manual = handlers.connectMqtt({ brokerUrl: 'mqtt://localhost:1883', autoConnect: true });
      const connected = mockMqttClient.on.mock.calls.find(([event]) => event === 'connect')![1];
      expect(mockMqttClient.on.mock.calls.filter(([event]) => event === 'connect')).toHaveLength(1);
      mockMqttClient.connected = true;
      connected();
      await Promise.all([automatic, manual]);
      expect(mockMqttClient.subscribeAsync).toHaveBeenCalledTimes(1);
      await handlers.disconnectMqtt();
    },
  );

  function registerConnection(startup = createMockStartup()) {
    mqttModule.register({
      eventBus,
      ipcRouter,
      storage,
      settingsStore,
      queryBus,
      startup,
      membership: new DirectorMembership(storage, eventBus),
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
    return vi.mocked(ipcRouter.register).mock.calls[0]![1] as unknown as {
      connectMqtt(input: { brokerUrl: string; laneAlias?: string; autoConnect?: boolean }): Promise<void>;
      disconnectMqtt(): Promise<void>;
      getMqttStatus(): Promise<{ status: string; error?: string }>;
    };
  }

  it('queues different manual settings behind an in-flight automatic connection', async () => {
    const startup = createMockStartup();
    settingsStore.saveMqttSettings({
      ...settingsStore.getMqttSettings(),
      enabled: true,
      autoConnect: true,
      brokerUrl: 'mqtt://auto:1883',
      laneAlias: 'Auto Lane',
    });
    const save = vi.spyOn(settingsStore, 'saveMqttSettings');
    mockMqttClient.on.mockReset();
    const handlers = registerConnection(startup);
    const automatic = vi.mocked(startup.afterReady).mock.calls[0]![0]();
    const manual = handlers.connectMqtt({
      brokerUrl: 'mqtt://manual:1883',
      laneAlias: 'Manual Lane',
      autoConnect: true,
    });
    expect(mockMqttClient.on.mock.calls.filter(([event]) => event === 'connect')).toHaveLength(1);
    mockMqttClient.connected = true;
    mockMqttClient.on.mock.calls.find(([event]) => event === 'connect')![1]();
    await automatic;
    await vi.waitFor(() =>
      expect(mockMqttClient.on.mock.calls.filter(([event]) => event === 'connect')).toHaveLength(3),
    );
    mockMqttClient.connected = true;
    mockMqttClient.on.mock.calls
      .filter(([event]) => event === 'connect')
      .at(-1)![1]();
    await manual;
    expect(save).toHaveBeenLastCalledWith(
      expect.objectContaining({ brokerUrl: 'mqtt://manual:1883', laneAlias: 'Manual Lane' }),
    );
    await handlers.disconnectMqtt();
  });

  it('publishes only hardware and safety states while startup is ERROR', async () => {
    const startup = createMockStartup();
    vi.spyOn(startup, 'isReady').mockReturnValue(false);
    vi.mocked(competitionRepository.findActive).mockRejectedValue(new Error('Unreadable run'));
    mockMqttClient.on.mockImplementation((event: string, callback: () => void) => {
      if (event === 'connect')
        setTimeout(() => {
          mockMqttClient.connected = true;
          callback();
        }, 0);
    });
    const handlers = registerConnection(startup);
    await handlers.connectMqtt({ brokerUrl: 'mqtt://localhost:1883' });
    const topics = mockMqttClient.publishAsync.mock.calls.map(([topic]) => topic as string);
    expect(topics.length).toBeGreaterThan(0);
    expect(topics.every((topic) => topic.includes('/hardware/state') || topic.includes('/safety/state'))).toBe(true);
    expect(competitionRepository.findActive).not.toHaveBeenCalled();
    await handlers.disconnectMqtt();
  });

  it('keeps a failed first republish visible and lets a manual connect retry it', async () => {
    const session = buildSession();
    const state = CompetitionState.create('11111111-1111-4111-8111-111111111111', session.id, BR60S.config);
    vi.mocked(competitionRepository.findActive).mockResolvedValue(state);
    vi.mocked(competitionRepository.findById).mockResolvedValue(state);
    vi.mocked(sessionRepository.findById).mockResolvedValue(session);
    let fail = true;
    mockMqttClient.publishAsync.mockImplementation(async (topic: string) => {
      if (fail && topic.endsWith('/score')) throw new Error('Initial score replay failed');
    });
    mockMqttClient.on.mockImplementation((event: string, callback: () => void) => {
      if (event === 'connect')
        setTimeout(() => {
          mockMqttClient.connected = true;
          callback();
        }, 0);
    });
    const handlers = registerConnection();
    await expect(handlers.connectMqtt({ brokerUrl: 'mqtt://localhost:1883' })).rejects.toMatchObject({
      code: 'MQTT_PUBLISH_FAILED',
    });
    expect(await handlers.getMqttStatus()).toMatchObject({
      status: 'disconnected',
      error: expect.stringContaining('/score'),
    });
    fail = false;
    await handlers.connectMqtt({ brokerUrl: 'mqtt://localhost:1883' });
    expect(await handlers.getMqttStatus()).toMatchObject({ status: 'connected' });
    expect((await handlers.getMqttStatus()).error).toBeUndefined();
    await handlers.disconnectMqtt();
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
      startup: createMockStartup(),
      membership: new DirectorMembership(storage, eventBus),
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
