// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import type { LaneTimerService } from '@/main/modules/competition/infra/LaneTimerService';
import { mqttModule } from '@/main/modules/mqtt/mqtt.module';
import type { ISessionRepository } from '@/main/modules/session/domain/ISessionRepository';
import type { CommandBus } from '@/main/shared-infra/cqrs/CommandBus';
import type { QueryBus } from '@/main/shared-infra/cqrs/QueryBus';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import type { IpcRouter } from '@/main/shared-infra/ipc/IpcRouter';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

// ── mock electron ──────────────────────────────────────────────
vi.mock('electron', () => ({
  app: { getVersion: () => '1.0.0-test' },
}));

// ── mock mqtt ──────────────────────────────────────────────────
vi.mock('mqtt', () => ({
  default: {
    connect: vi.fn(() => ({
      connected: false,
      on: vi.fn(),
      removeListener: vi.fn(),
      end: vi.fn(),
      publishAsync: vi.fn(),
      subscribeAsync: vi.fn(),
      unsubscribeAsync: vi.fn(),
    })),
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
  const store = new Map<string, unknown>([['mqtt.laneId', 'test-lane-uuid']]);
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
    findById: vi.fn().mockResolvedValue(null),
    findAll: vi.fn().mockResolvedValue([]),
    delete: vi.fn(),
    findActive: vi.fn().mockResolvedValue(null),
  };
}

describe('mqtt.module', () => {
  let eventBus: IEventBus;
  let ipcRouter: IpcRouter;
  let storage: ILocalStorage;
  let commandBus: CommandBus;
  let queryBus: QueryBus;
  let competitionRepository: ICompetitionRepository;
  let timerService: LaneTimerService;
  let sessionRepository: ISessionRepository;

  beforeEach(() => {
    eventBus = createMockEventBus();
    ipcRouter = createMockIpcRouter();
    storage = createMockStorage();
    commandBus = createMockCommandBus();
    queryBus = createMockQueryBus();
    competitionRepository = createMockCompetitionRepository();
    timerService = createMockTimerService();
    sessionRepository = createMockSessionRepository();
  });

  it('should have correct name', () => {
    expect(mqttModule.name).toBe('mqtt');
  });

  it('should declare correct dependencies', () => {
    expect(mqttModule.deps).toEqual([
      'eventBus',
      'ipcRouter',
      'storage',
      'queryBus',
      'commandBus',
      'competitionRepository',
      'timerService',
      'sessionRepository',
    ]);
  });

  it('should register without errors', () => {
    expect(() => {
      mqttModule.register({
        eventBus,
        ipcRouter,
        storage,
        queryBus,
        commandBus,
        competitionRepository,
        timerService,
        sessionRepository,
      });
    }).not.toThrow();
  });

  it('should register IPC handlers via ipcRouter', () => {
    mqttModule.register({
      eventBus,
      ipcRouter,
      storage,
      queryBus,
      commandBus,
      competitionRepository,
      timerService,
      sessionRepository,
    });

    expect(ipcRouter.register).toHaveBeenCalledTimes(1);
    expect(ipcRouter.register).toHaveBeenCalledWith(expect.objectContaining({ namespace: 'mqtt' }), expect.any(Object));
  });

  it('should subscribe to ConnectionEstablished and ConnectionLost events', () => {
    mqttModule.register({
      eventBus,
      ipcRouter,
      storage,
      queryBus,
      commandBus,
      competitionRepository,
      timerService,
      sessionRepository,
    });

    expect(eventBus.on).toHaveBeenCalledWith('ConnectionEstablished', expect.any(Function));
    expect(eventBus.on).toHaveBeenCalledWith('ConnectionLost', expect.any(Function));
  });

  it('should subscribe to ShotRecorded event', () => {
    mqttModule.register({
      eventBus,
      ipcRouter,
      storage,
      queryBus,
      commandBus,
      competitionRepository,
      timerService,
      sessionRepository,
    });

    expect(eventBus.on).toHaveBeenCalledWith('ShotRecorded', expect.any(Function));
  });
});
