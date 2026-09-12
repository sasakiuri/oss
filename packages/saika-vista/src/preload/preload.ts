// SPDX-License-Identifier: MIT
import { AppUpdateStateSchema } from '@sasakiuri/saika-updater';
import { contextBridge, ipcRenderer } from 'electron';

import type { VistaBridge } from '../shared/model';
import type { UpdateBridge } from '../shared/updateBridge';

const bridge: VistaBridge = {
  getState: () => ipcRenderer.invoke('vista:state'),
  command: (command) => ipcRenderer.invoke('vista:command', command),
  discover: () => ipcRenderer.invoke('vista:discover'),
  getAudience: () => ipcRenderer.invoke('vista:audience'),
  rendered: (revision) => ipcRenderer.invoke('vista:rendered', revision),
  onChange: (callback) => {
    const listener = (): void => callback();
    ipcRenderer.on('vista:changed', listener);
    return () => ipcRenderer.removeListener('vista:changed', listener);
  },
};
contextBridge.exposeInMainWorld('vista', bridge);

const updates: UpdateBridge = {
  getState: async () => AppUpdateStateSchema.parse(await ipcRenderer.invoke('vista:updates-state')),
  check: async () => AppUpdateStateSchema.parse(await ipcRenderer.invoke('vista:updates-check')),
  install: () => ipcRenderer.invoke('vista:updates-install'),
  onChange: (callback) => {
    const listener = (_event: unknown, input: unknown) => callback(AppUpdateStateSchema.parse(input));
    ipcRenderer.on('vista:updates-changed', listener);
    return () => ipcRenderer.removeListener('vista:updates-changed', listener);
  },
};
contextBridge.exposeInMainWorld('vistaUpdates', updates);
