// SPDX-License-Identifier: MIT
/** Renderer bridge types inferred from the shared IPC contracts. */

import type { InferBridge, InferEventBridge } from '@sasakiuri/saika-ipc';

import type { eventsContract, sessionContract } from '@/shared/ipc/contracts';
import type { LaneBridge } from '@/shared/ipc/laneBridgeContracts';

type SessionBridge = InferBridge<typeof sessionContract>;

/**
 * Electron API interface exposed to Renderer Process
 */
export interface ElectronAPI extends LaneBridge {
  /** Whether the current window uses native OS chrome */
  readonly hasNativeWindowFrame: boolean;

  /** Application version from package.json */
  readonly appVersion: string;

  /** Session commands */
  readonly commands: Pick<SessionBridge, 'recordShot' | 'switchMode'>;

  /** Session queries */
  readonly queries: Pick<SessionBridge, 'getSessionScore' | 'getShotHistory'>;

  /** Event subscription methods */
  readonly on: InferEventBridge<typeof eventsContract>;
}

// ---------------------------------------------------------------------------
// Global Window interface extension
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    /** Electron API exposed via preload script */
    electronAPI: ElectronAPI;
  }
}
