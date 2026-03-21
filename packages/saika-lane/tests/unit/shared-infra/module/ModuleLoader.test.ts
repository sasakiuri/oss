// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ModuleDefinition, ServiceRegistry } from '@/main/composition/ModuleDefinition';
import { ModuleLoader } from '@/main/shared-infra/module/ModuleLoader';

// ---------- logger mock ----------

vi.mock('@/main/shared-infra/logging/createLogger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// ---------- helpers ----------

/**
 * Build a mock ServiceRegistry with vi.fn() stubs for all keys.
 */
function buildMockRegistry(): ServiceRegistry {
  return {
    commandBus: { register: vi.fn(), execute: vi.fn(), use: vi.fn() },
    queryBus: { register: vi.fn(), execute: vi.fn(), use: vi.fn() },
    eventBus: { publish: vi.fn(), subscribe: vi.fn() },
    ipcRouter: { register: vi.fn() },
    storage: { get: vi.fn(), set: vi.fn(), delete: vi.fn(), has: vi.fn() },
    usbManager: { connect: vi.fn(), disconnect: vi.fn() },
    sessionRepository: { save: vi.fn(), findById: vi.fn() },
    connectionRepository: { save: vi.fn(), findById: vi.fn() },
    competitionRepository: { save: vi.fn(), findById: vi.fn() },
    printWindowService: { print: vi.fn() },
    adapterRegistry: { getAdapter: vi.fn(), getAdapterByDeviceId: vi.fn() },
    mainWindow: { isDestroyed: vi.fn(), webContents: { send: vi.fn() } },
  } as unknown as ServiceRegistry;
}

// ---------- tests ----------

describe('ModuleLoader', () => {
  let loader: ModuleLoader;
  let registry: ServiceRegistry;

  beforeEach(() => {
    loader = new ModuleLoader();
    registry = buildMockRegistry();
  });

  it('loads a single module and injects only the dependencies specified in deps', () => {
    const registerSpy = vi.fn();

    const mod: ModuleDefinition<'commandBus' | 'eventBus'> = {
      name: 'testModule',
      deps: ['commandBus', 'eventBus'],
      register: registerSpy,
    };

    loader.load([mod], registry);

    expect(registerSpy).toHaveBeenCalledTimes(1);

    const injected = registerSpy.mock.calls[0]![0] as Record<string, unknown>;
    expect(injected.commandBus).toBe(registry.commandBus);
    expect(injected.eventBus).toBe(registry.eventBus);
  });

  it('loads multiple modules sequentially', () => {
    const order: string[] = [];

    const mod1: ModuleDefinition<'commandBus'> = {
      name: 'first',
      deps: ['commandBus'],
      register: () => {
        order.push('first');
      },
    };

    const mod2: ModuleDefinition<'queryBus' | 'ipcRouter'> = {
      name: 'second',
      deps: ['queryBus', 'ipcRouter'],
      register: () => {
        order.push('second');
      },
    };

    const mod3: ModuleDefinition<'eventBus'> = {
      name: 'third',
      deps: ['eventBus'],
      register: () => {
        order.push('third');
      },
    };

    loader.load([mod1, mod2, mod3], registry);

    expect(order).toEqual(['first', 'second', 'third']);
  });

  it('does not throw when an empty array is passed', () => {
    expect(() => {
      loader.load([], registry);
    }).not.toThrow();
  });

  it('calls register even for modules with empty deps', () => {
    const registerSpy = vi.fn();

    const mod: ModuleDefinition = {
      name: 'noDeps',
      deps: [],
      register: registerSpy,
    };

    loader.load([mod], registry);

    expect(registerSpy).toHaveBeenCalledTimes(1);
  });
});
