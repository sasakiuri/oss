// SPDX-License-Identifier: MIT
import { ipcRenderer } from 'electron';
import { z } from 'zod';

import type { Contract, InferBridge, ProcedureMap } from '@/shared/ipc/defineContract';

/**
 * Create a preload bridge namespace from a contract.
 * Maps each procedure to an `ipcRenderer.invoke(channel, payload)` call.
 *
 * - Procedures with z.void() input: () => ipcRenderer.invoke(channel)
 * - Procedures with input: (payload) => ipcRenderer.invoke(channel, payload)
 */
/** Type-safe Object.keys for known-shape objects */
function typedKeys<T extends object>(obj: T): (keyof T & string)[] {
  return Object.keys(obj) as (keyof T & string)[];
}

export function createBridgeNamespace<C extends Contract<string, ProcedureMap>>(contract: C): InferBridge<C> {
  const bridge = {} as Record<string, (...args: unknown[]) => unknown>;

  for (const key of typedKeys(contract.procedures)) {
    const channel = contract.channels[key]!;
    const proc = contract.procedures[key]!;

    // Zod v4: use instanceof z.ZodVoid (NOT _def.typeName)
    if (proc.input instanceof z.ZodVoid) {
      bridge[key] = () => ipcRenderer.invoke(channel);
    } else {
      bridge[key] = (payload: unknown) => ipcRenderer.invoke(channel, payload);
    }
  }

  return bridge as InferBridge<C>;
}
