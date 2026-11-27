// SPDX-License-Identifier: MIT
import { AppUpdateStateSchema } from '@sasakiuri/saika-updater';
import { contextBridge, ipcRenderer } from 'electron';

import { VISTA_CHANNEL } from '../shared/ipcChannels';
import type { VistaBridge } from '../shared/model';
import type { UpdateBridge } from '../shared/updateBridge';

const bridge: VistaBridge = {
  getState: () => ipcRenderer.invoke(VISTA_CHANNEL.state),
  command: (command) => ipcRenderer.invoke(VISTA_CHANNEL.command, command),
  discover: () => ipcRenderer.invoke(VISTA_CHANNEL.discover),
  getAudience: () => ipcRenderer.invoke(VISTA_CHANNEL.audience),
  rendered: (revision) => ipcRenderer.invoke(VISTA_CHANNEL.rendered, revision),
  onChange: (callback) => {
    const listener = (): void => callback();
    ipcRenderer.on(VISTA_CHANNEL.changed, listener);
    return () => ipcRenderer.removeListener(VISTA_CHANNEL.changed, listener);
  },
};
contextBridge.exposeInMainWorld('vista', bridge);

const updates: UpdateBridge = {
  getState: async () => AppUpdateStateSchema.parse(await ipcRenderer.invoke(VISTA_CHANNEL.updatesState)),
  check: async () => AppUpdateStateSchema.parse(await ipcRenderer.invoke(VISTA_CHANNEL.updatesCheck)),
  install: () => ipcRenderer.invoke(VISTA_CHANNEL.updatesInstall),
  onChange: (callback) => {
    const listener = (_event: unknown, input: unknown) => callback(AppUpdateStateSchema.parse(input));
    ipcRenderer.on(VISTA_CHANNEL.updatesChanged, listener);
    return () => ipcRenderer.removeListener(VISTA_CHANNEL.updatesChanged, listener);
  },
};
contextBridge.exposeInMainWorld('vistaUpdates', updates);
