/** Builds Director's validated event subscriptions from the event contract. */
import { ipcRenderer } from 'electron';
import type { EventContract, EventMap, InferEventBridge } from '@sasakiuri/saika-ipc';

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
