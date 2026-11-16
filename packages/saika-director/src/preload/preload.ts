import { createProcedureBridge } from '@sasakiuri/saika-ipc/preload';
import { contextBridge, ipcRenderer } from 'electron';

import { eventsContract } from '@/shared/ipc/contracts';
import { directorBridgeContracts, type DirectorBridge } from '@/shared/ipc/directorBridgeContracts';
import type { ElectronAPI } from '@/shared/types/ElectronAPI';

import { buildEventBridge } from './buildPreloadAPI';

declare const __APP_VERSION__: string;

const bridge = Object.fromEntries(
  Object.entries(directorBridgeContracts).map(([namespace, contract]) => [
    namespace,
    createProcedureBridge(ipcRenderer, contract),
  ]),
) as unknown as DirectorBridge;

const electronAPI: ElectronAPI = {
  ...bridge,
  appVersion: __APP_VERSION__,
  on: buildEventBridge(eventsContract),
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
