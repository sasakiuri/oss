// SPDX-License-Identifier: MIT
import { vi } from 'vitest';

import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import type { LaneTimerService } from '@/main/modules/competition/infra/LaneTimerService';
import type { IConnectionRepository } from '@/main/modules/connection/domain/IConnectionRepository';
import type { IUSBConnectionManager } from '@/main/modules/connection/infra/usb/IUSBConnectionManager';
import type { PrintWindowService } from '@/main/modules/report/infra/PrintWindowService';
import type { ISessionRepository } from '@/main/modules/session/domain/ISessionRepository';
import type { AdapterRegistry } from '@/main/modules/target/infra/AdapterRegistry';
import type { CommandBus } from '@/main/shared-infra/cqrs/CommandBus';
import type { QueryBus } from '@/main/shared-infra/cqrs/QueryBus';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import type { IpcRouter } from '@/main/shared-infra/ipc/IpcRouter';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

export function createMockCommandBus(): CommandBus {
  return {
    register: vi.fn(),
    execute: vi.fn(),
    use: vi.fn(),
  } as unknown as CommandBus;
}

export function createMockQueryBus(): QueryBus {
  return {
    register: vi.fn(),
    execute: vi.fn(),
    use: vi.fn(),
  } as unknown as QueryBus;
}

export function createMockEventBus(): IEventBus {
  const listeners = new Map<string, Set<Function>>();

  return {
    emit: vi.fn((event) => {
      const handlers = listeners.get(event.type);
      if (handlers) {
        for (const handler of handlers) {
          handler(event);
        }
      }
    }),
    on: vi.fn((eventType: string, handler: Function) => {
      if (!listeners.has(eventType)) {
        listeners.set(eventType, new Set());
      }
      listeners.get(eventType)!.add(handler);
      return () => {
        listeners.get(eventType)?.delete(handler);
      };
    }),
  } as unknown as IEventBus;
}

export function createMockIpcRouter(): IpcRouter {
  return {
    register: vi.fn(),
  } as unknown as IpcRouter;
}

export function createMockSessionRepository(): ISessionRepository {
  return {
    save: vi.fn(),
    saveShot: vi.fn(),
    findById: vi.fn().mockResolvedValue(null),
    findAll: vi.fn().mockResolvedValue([]),
    delete: vi.fn(),
    findActive: vi.fn().mockResolvedValue(null),
  };
}

export function createMockConnectionRepository(): IConnectionRepository {
  return {
    save: vi.fn(),
    findById: vi.fn().mockResolvedValue(null),
    findAll: vi.fn().mockResolvedValue([]),
    delete: vi.fn(),
    findActive: vi.fn().mockResolvedValue(null),
    findHistory: vi.fn().mockResolvedValue([]),
  };
}

export function createMockCompetitionRepository(): ICompetitionRepository {
  return {
    save: vi.fn(),
    findById: vi.fn().mockResolvedValue(null),
    findBySessionId: vi.fn().mockResolvedValue(null),
    findActive: vi.fn().mockResolvedValue(null),
    delete: vi.fn(),
  };
}

export function createMockUSBManager(): IUSBConnectionManager {
  const eventListeners = new Map<string, Set<Function>>();

  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    reconnect: vi.fn(),
    getStatus: vi.fn(),
    listPorts: vi.fn().mockResolvedValue([]),
    on: vi.fn((event: string, listener: Function) => {
      if (!eventListeners.has(event)) {
        eventListeners.set(event, new Set());
      }
      eventListeners.get(event)!.add(listener);
      return () => {
        eventListeners.get(event)?.delete(listener);
      };
    }),
    setSessionContextProvider: vi.fn(),
    setOnShotDetected: vi.fn(),
    resetShotCounter: vi.fn(),
    sendMode: vi.fn().mockResolvedValue(undefined),
  } as unknown as IUSBConnectionManager;
}

export function createMockStorage(): ILocalStorage {
  const store = new Map<string, unknown>();

  return {
    get: vi.fn((key: string) => store.get(key)),
    set: vi.fn((key: string, value: unknown) => {
      store.set(key, value);
    }),
    setMany: vi.fn((entries: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(entries)) {
        store.set(key, value);
      }
    }),
    has: vi.fn((key: string) => store.has(key)),
    delete: vi.fn((key: string) => {
      store.delete(key);
    }),
    getAll: vi.fn(() => Object.fromEntries(store)),
    clear: vi.fn(() => {
      store.clear();
    }),
  } as unknown as ILocalStorage;
}

export function createMockPrintWindowService(): PrintWindowService {
  return {
    open: vi.fn(),
  } as unknown as PrintWindowService;
}

export function createMockTimerService(): LaneTimerService {
  return {
    start: vi.fn(),
    stop: vi.fn(),
    syncRemaining: vi.fn(),
  } as unknown as LaneTimerService;
}

export function createMockAdapterRegistry(): AdapterRegistry {
  const adapters = new Map<string, unknown>();

  return {
    registerAdapter: vi.fn((id: string, adapter: unknown) => {
      adapters.set(id, adapter);
    }),
    removeAdapter: vi.fn(),
    hasAdapter: vi.fn((id: string) => adapters.has(id)),
    getAdapterCount: vi.fn(() => adapters.size),
    getAdapter: vi.fn((id: string) => adapters.get(id)),
    assignDeviceAdapter: vi.fn(),
    getAdapterByDeviceId: vi.fn(),
    getRegisteredManufacturerIds: vi.fn(() => Array.from(adapters.keys())),
    getRegisteredDeviceIds: vi.fn(() => []),
  } as unknown as AdapterRegistry;
}
