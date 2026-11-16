// SPDX-License-Identifier: MIT
import type { EventContract, EventMap, InferEventBridge } from '@sasakiuri/saika-ipc';
import { ipcRenderer } from 'electron';

/**
 * Create an event subscription bridge from an event contract.
 * Each event becomes a subscribe function that returns an unsubscribe function.
 *
 * Usage:
 *   const unsub = bridge.shotReceived((data) => { ... });
 *   // later: unsub(); to clean up
 */
/** Type-safe Object.keys for known-shape objects */
function typedKeys<T extends object>(obj: T): (keyof T & string)[] {
  return Object.keys(obj) as (keyof T & string)[];
}

export function createEventBridge<C extends EventContract<string, EventMap>>(contract: C): InferEventBridge<C> {
  const bridge = {} as Record<string, (callback: (data: unknown) => void) => () => void>;

  for (const key of typedKeys(contract.events)) {
    const channel = contract.channels[key]!;
    const { schema } = contract.events[key]!;

    bridge[key] = (callback: (data: unknown) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: unknown) => {
        // A payload outside the contract never reaches the renderer; a valid one is passed on as received.
        const result = schema.safeParse(data);
        if (!result.success) {
          console.error(
            `[IPC] Ignored invalid event payload for "${channel}"`,
            result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
          );
          return;
        }
        callback(data);
      };
      ipcRenderer.on(channel, handler);
      return () => ipcRenderer.removeListener(channel, handler);
    };
  }

  return bridge as InferEventBridge<C>;
}
