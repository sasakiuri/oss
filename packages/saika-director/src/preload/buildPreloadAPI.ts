/** Builds preload methods and event subscriptions from IPC contracts. */
import { ipcRenderer } from 'electron';
import { z } from 'zod';
import type {
  Contract,
  ProcedureMap,
  EventContract,
  EventMap,
  InferBridge,
  InferEventBridge,
} from '@/shared/ipc/defineContract';

// ---------------------------------------------------------------------------
// Procedure bridge
// ---------------------------------------------------------------------------

/**
 * Build an invoke bridge from a procedure contract.
 *
 * Each contract key becomes a method that calls `ipcRenderer.invoke`
 * with the corresponding channel string. Void-input procedures accept
 * no arguments; others accept a single payload argument.
 */
export function buildProcedureBridge<C extends Contract<string, ProcedureMap>>(contract: C): InferBridge<C> {
  const bridge: Record<string, (...args: unknown[]) => Promise<unknown>> = {};

  for (const key of Object.keys(contract.procedures)) {
    const channel = (contract.channels as Record<string, string>)[key]!;
    const proc = contract.procedures[key]!;

    if (proc.input instanceof z.ZodVoid) {
      bridge[key] = () => ipcRenderer.invoke(channel);
    } else {
      bridge[key] = (payload: unknown) => ipcRenderer.invoke(channel, payload);
    }
  }

  return bridge as InferBridge<C>;
}

// ---------------------------------------------------------------------------
// Event bridge
// ---------------------------------------------------------------------------

/**
 * Build an event subscription bridge from an event contract.
 *
 * Each event key becomes a subscribe function that returns an
 * unsubscribe function (matching the `InferEventBridge` signature).
 */
export function buildEventBridge<C extends EventContract<string, EventMap>>(contract: C): InferEventBridge<C> {
  const bridge: Record<string, (callback: (data: unknown) => void) => () => void> = {};

  for (const key of Object.keys(contract.events)) {
    const channel = (contract.channels as Record<string, string>)[key]!;
    const eventDefinition = contract.events[key]!;
    bridge[key] = (callback: (data: unknown) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: unknown) => {
        const result = eventDefinition.schema.safeParse(data);
        if (!result.success) {
          console.error(
            `[IPC] Ignored invalid event payload for "${channel}"`,
            result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
          );
          return;
        }
        callback(result.data);
      };
      ipcRenderer.on(channel, handler);
      return () => ipcRenderer.removeListener(channel, handler);
    };
  }

  return bridge as InferEventBridge<C>;
}

// ---------------------------------------------------------------------------
// Aliased bridge (for namespaces with renamed methods)
// ---------------------------------------------------------------------------

/**
 * Build a procedure bridge with key aliasing.
 *
 * `aliasMap` maps preload method names to contract procedure keys.
 * Contract keys that appear as alias targets are exposed under the
 * alias name only; all other keys keep their original names.
 *
 * Used for the championship namespace where renderer-facing method
 * names differ from contract keys (e.g. `createChampionship` → `create`).
 */
export function buildAliasedBridge<C extends Contract<string, ProcedureMap>>(
  contract: C,
  aliasMap: Record<string, string>,
): Record<string, (...args: unknown[]) => Promise<unknown>> {
  const bridge: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
  const aliasedKeys = new Set(Object.values(aliasMap));

  for (const key of Object.keys(contract.procedures)) {
    const channel = (contract.channels as Record<string, string>)[key]!;
    const proc = contract.procedures[key]!;
    const invokeFn =
      proc.input instanceof z.ZodVoid
        ? () => ipcRenderer.invoke(channel)
        : (payload: unknown) => ipcRenderer.invoke(channel, payload);

    if (!aliasedKeys.has(key)) {
      bridge[key] = invokeFn;
    }
  }

  for (const [alias, contractKey] of Object.entries(aliasMap)) {
    const channel = (contract.channels as Record<string, string>)[contractKey]!;
    const proc = contract.procedures[contractKey]!;
    bridge[alias] =
      proc.input instanceof z.ZodVoid
        ? () => ipcRenderer.invoke(channel)
        : (payload: unknown) => ipcRenderer.invoke(channel, payload);
  }

  return bridge;
}
