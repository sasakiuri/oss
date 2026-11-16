// SPDX-License-Identifier: MIT
/** Preload procedure bridge. The app passes its `ipcRenderer`, so this module loads no Electron or Node code. */
import { z } from 'zod';

import type { Contract, InferBridge, ProcedureMap } from './index';

/** The part of Electron's `ipcRenderer` that the procedure bridge calls. */
export interface IpcInvoker {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
}

/**
 * Create a preload bridge namespace from a contract.
 * Maps each procedure to an `ipcRenderer.invoke(channel, payload)` call.
 *
 * - Procedures with z.void() input: () => ipcRenderer.invoke(channel)
 * - Procedures with input: (payload) => ipcRenderer.invoke(channel, payload)
 */
export function createProcedureBridge<C extends Contract<string, ProcedureMap>>(
  ipcRenderer: IpcInvoker,
  contract: C,
): InferBridge<C> {
  const bridge: Record<string, (...args: unknown[]) => Promise<unknown>> = {};

  for (const key of Object.keys(contract.procedures)) {
    const channel = (contract.channels as Record<string, string>)[key]!;
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
