// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type { Contract, ProcedureMap } from '@sasakiuri/saika-ipc';

const electron = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  invoke: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
}));

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: electron.exposeInMainWorld },
  ipcRenderer: { invoke: electron.invoke, on: electron.on, removeListener: electron.removeListener },
}));

import '@/preload/preload';

const contracts = Object.values(
  import.meta.glob<Record<string, unknown>>('../../../src/shared/ipc/contracts/*.contract.ts', { eager: true }),
)
  .flatMap((module) => Object.values(module))
  .filter(
    (value): value is Contract<string, ProcedureMap> =>
      typeof value === 'object' && value !== null && 'procedures' in value,
  );

describe('preload API', () => {
  const api = electron.exposeInMainWorld.mock.calls[0]?.[1] as Record<string, unknown>;

  it('exposes one electronAPI object', () => {
    expect(electron.exposeInMainWorld).toHaveBeenCalledExactlyOnceWith('electronAPI', api);
    expect(api.appVersion).toEqual(expect.any(String));
  });

  it('exposes no debug log query or event', () => {
    expect(api).not.toHaveProperty('queries');
    expect(api.on).not.toHaveProperty('debugLog');
  });

  it('exposes every contract procedure as one method that invokes its channel', () => {
    const procedures = new Map<string, { namespace: string; key: string; voidInput: boolean }>();
    for (const contract of contracts) {
      for (const [key, procedure] of Object.entries(contract.procedures)) {
        procedures.set(contract.channels[key]!, {
          namespace: contract.namespace,
          key,
          voidInput: procedure.input instanceof z.ZodVoid,
        });
      }
    }

    const contractOfNamespace: Record<string, string> = {};
    const invokedChannels: string[] = [];
    for (const [namespace, methods] of Object.entries(api)) {
      if (namespace === 'on' || typeof methods !== 'object' || methods === null) continue;
      for (const [name, method] of Object.entries(methods as Record<string, (payload: unknown) => unknown>)) {
        electron.invoke.mockClear();
        const payload = { probe: `${namespace}.${name}` };
        method(payload);

        expect(electron.invoke, `${namespace}.${name}`).toHaveBeenCalledOnce();
        const [channel, ...args] = electron.invoke.mock.calls[0]! as [string, ...unknown[]];
        const procedure = procedures.get(channel);
        expect(procedure, `${namespace}.${name} -> ${channel}`).toBeDefined();
        expect(procedure!.key).toBe(name);
        expect(args, `${namespace}.${name}`).toEqual(procedure!.voidInput ? [] : [payload]);
        contractOfNamespace[namespace] ??= procedure!.namespace;
        expect(procedure!.namespace, `${namespace}.${name}`).toBe(contractOfNamespace[namespace]);
        invokedChannels.push(channel);
      }
    }

    expect(invokedChannels.sort()).toEqual([...procedures.keys()].sort());
    // Each API namespace uses the contract of the same name, except this one.
    expect(contractOfNamespace).toEqual({
      ...Object.fromEntries(Object.keys(contractOfNamespace).map((namespace) => [namespace, namespace])),
      laneControl: 'unified-lane-control',
    });
  });
});
