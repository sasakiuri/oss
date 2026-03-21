// SPDX-License-Identifier: MIT
import { ipcRenderer } from 'electron';

import type { EventContract, EventMap, InferEventBridge } from '@/shared/ipc/defineContract';

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

    bridge[key] = (callback: (data: unknown) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data);
      ipcRenderer.on(channel, handler);
      return () => ipcRenderer.removeListener(channel, handler);
    };
  }

  return bridge as InferEventBridge<C>;
}
