// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from 'vitest';

import type { ModuleDefinition, ServiceRegistry } from '@/main/shared-infra/module/ModuleDefinition';
import { ModuleLoader } from '@/main/shared-infra/module/ModuleLoader';

vi.mock('@/shared/utils/Logger', () => ({ Logger: { create: () => ({ info: vi.fn() }) } }));

describe('ModuleLoader', () => {
  const registry = { commandBus: {}, queryBus: {} } as ServiceRegistry;

  it('injects only declared dependencies and preserves module output order', () => {
    const lifecycle = { name: 'worker', start: vi.fn(), stop: vi.fn() };
    const rule = { eventType: 'Changed', channel: 'changed', extractPayload: () => ({}) };
    const register = vi.fn(() => ({ lifecycle: [lifecycle], eventForwarding: [rule] }));
    const modules: ModuleDefinition[] = [{ name: 'worker', deps: ['commandBus'], register }];
    const loaded = new ModuleLoader().load(modules, registry);
    expect(register).toHaveBeenCalledWith({ commandBus: registry.commandBus });
    expect(loaded).toEqual({ lifecycleEntries: [lifecycle], eventForwardingRules: [rule] });
  });

  it('rejects duplicates before any handlers are installed', () => {
    const register = vi.fn();
    const mod: ModuleDefinition = { name: 'duplicate', deps: [], register };
    expect(() => new ModuleLoader().load([mod, mod], registry)).toThrow('Duplicate module name: "duplicate"');
    expect(register).not.toHaveBeenCalled();
  });

  it('checks every dependency before beginning registration', () => {
    const register = vi.fn();
    const modules: ModuleDefinition[] = [
      { name: 'first', deps: ['commandBus'], register },
      { name: 'missing', deps: ['database'], register },
    ];
    expect(() => new ModuleLoader().load(modules, registry)).toThrow('Module "missing" requires service "database"');
    expect(register).not.toHaveBeenCalled();
  });
});
