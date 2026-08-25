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
export function createEventBridge<C extends EventContract<string, EventMap>>(contract: C): InferEventBridge<C> {
  const bridge: Record<string, unknown> = {};

  for (const key of Object.keys(contract.events)) {
    const channel = contract.channels[key as keyof typeof contract.channels] as string;
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
