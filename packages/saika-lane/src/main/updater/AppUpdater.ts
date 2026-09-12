// SPDX-License-Identifier: MIT
import { UpdaterService, type AutoUpdaterModuleLoader } from '@sasakiuri/saika-updater/main';
import { app, autoUpdater as nativeAutoUpdater, type BrowserWindow } from 'electron';

import { getLogger } from '@/main/shared-infra/logging';
import { eventsContract } from '@/shared/ipc/contracts';

export interface AppUpdaterOptions {
  mainWindow: BrowserWindow;
  onBeforeQuitForInstall?: () => void;
  isPackaged?: boolean;
  currentVersion?: string;
  loadAutoUpdater?: AutoUpdaterModuleLoader;
}

export class AppUpdater extends UpdaterService {
  constructor(options: AppUpdaterOptions) {
    let nativeHandlerAttached = false;
    super({
      isPackaged: options.isPackaged ?? app.isPackaged,
      currentVersion: options.currentVersion ?? (typeof app.getVersion === 'function' ? app.getVersion() : '0.0.0'),
      autoInstallOnAppQuit: true,
      loadAutoUpdater: async () => {
        const loaded = options.loadAutoUpdater ? await options.loadAutoUpdater() : await import('electron-updater');
        if (!nativeHandlerAttached) {
          nativeAutoUpdater.on('before-quit-for-update', () => options.onBeforeQuitForInstall?.());
          nativeHandlerAttached = true;
        }
        return loaded;
      },
      onStateChange: (state) => {
        if (!options.mainWindow.isDestroyed()) {
          options.mainWindow.webContents.send(
            eventsContract?.channels?.updateStateChanged ?? 'event:updateStateChanged',
            state,
          );
        }
      },
      log: (level, message, details) => getLogger()[level](message, 'main', details),
    });
  }
}
