// SPDX-License-Identifier: MIT
import { createProcedureBridge } from '@sasakiuri/saika-ipc/preload';
import { ipcRenderer } from 'electron';

import { eventsContract, sessionContract } from '@/shared/ipc/contracts';
import { laneBridgeContracts, type LaneBridge } from '@/shared/ipc/laneBridgeContracts';
import type { ElectronAPI } from '@/shared/types/ElectronAPI';

import { createEventBridge } from './createEventBridge';

/**
 * Build the complete preload API from IPC contracts.
 *
 * Each namespace of `laneBridgeContracts` exposes its contract bridge unchanged. The session contract is
 * split into `commands` and `queries`.
 */
export function buildPreloadAPI(): ElectronAPI {
  const session = createProcedureBridge(ipcRenderer, sessionContract);
  const bridge = Object.fromEntries(
    Object.entries(laneBridgeContracts).map(([namespace, contract]) => [
      namespace,
      createProcedureBridge(ipcRenderer, contract),
    ]),
  ) as unknown as LaneBridge;

  return {
    ...bridge,
    hasNativeWindowFrame: process.env.SAIKA_LANE_NATIVE_WINDOW_FRAME === '1',
    appVersion: __APP_VERSION__,
    commands: {
      recordShot: session.recordShot,
      switchMode: session.switchMode,
    },
    queries: {
      getSessionScore: session.getSessionScore,
      getShotHistory: session.getShotHistory,
    },
    on: createEventBridge(eventsContract),
  };
}
