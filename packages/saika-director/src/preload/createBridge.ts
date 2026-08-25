import { ipcRenderer } from 'electron';
import { z } from 'zod';
import type { Contract, ProcedureMap, InferBridge } from '@/shared/ipc/defineContract';

/**
 * Create a preload bridge namespace from a contract.
 * Maps each procedure to an `ipcRenderer.invoke(channel, payload)` call.
 *
 * - Procedures with z.void() input: () => ipcRenderer.invoke(channel)
 * - Procedures with input: (payload) => ipcRenderer.invoke(channel, payload)
 */
export function createBridgeNamespace<C extends Contract<string, ProcedureMap>>(contract: C): InferBridge<C> {
  const bridge: Record<string, unknown> = {};

  for (const key of Object.keys(contract.procedures)) {
    const channel = contract.channels[key as keyof typeof contract.channels] as string;
    const proc = contract.procedures[key]!;

    // Check if input is z.void()
    if (proc.input instanceof z.ZodVoid) {
      bridge[key] = () => ipcRenderer.invoke(channel);
    } else {
      bridge[key] = (payload: unknown) => ipcRenderer.invoke(channel, payload);
    }
  }

  return bridge as InferBridge<C>;
}
