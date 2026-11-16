/** Renderer-side type of the preload bridge, derived from the IPC contracts. */
import type { InferEventBridge } from '@sasakiuri/saika-ipc';

import type { eventsContract } from '@/shared/ipc/contracts';
import type { DirectorBridge } from '@/shared/ipc/directorBridgeContracts';

export interface ElectronAPI extends DirectorBridge {
  /** Application version from package.json. */
  readonly appVersion: string;
  on: InferEventBridge<typeof eventsContract>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
