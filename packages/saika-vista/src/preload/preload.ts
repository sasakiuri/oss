// SPDX-License-Identifier: MIT
import { contextBridge, ipcRenderer } from 'electron';

import type { VistaBridge } from '../shared/model';

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
