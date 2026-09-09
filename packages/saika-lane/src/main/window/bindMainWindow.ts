// SPDX-License-Identifier: MIT
import { BrowserWindow, dialog } from 'electron';

import { IpcRouter } from '@/main/shared-infra/ipc/IpcRouter';
import { AppUpdater } from '@/main/updater/AppUpdater';
import { eventsContract, updaterContract, windowContract } from '@/shared/ipc/contracts';

/** Owns window controls, update actions and the close confirmation. */
export function bindMainWindow(mainWindow: BrowserWindow, ipcRouter: IpcRouter): AppUpdater {
  let skipCloseConfirmation = false;
  const appUpdater = new AppUpdater({
    mainWindow,
    onBeforeQuitForInstall: () => {
      skipCloseConfirmation = true;
    },
  });

  // 3.1 Register window operation handlers
  ipcRouter.register(windowContract, {
    toggleFullscreen: async () => {
      const next = !mainWindow.isFullScreen();
      mainWindow.setFullScreen(next);
      return { isFullscreen: next };
    },
    minimize: async () => {
      mainWindow.minimize();
    },
    maximize: async () => {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
      return {
        isMaximized: mainWindow.isMaximized(),
        isFullscreen: mainWindow.isFullScreen(),
      };
    },
    close: async () => {
      mainWindow.close();
    },
    getWindowState: async () => ({
      isMaximized: mainWindow.isMaximized(),
      isFullscreen: mainWindow.isFullScreen(),
    }),
  });

  ipcRouter.register(updaterContract, {
    getUpdateState: async () => appUpdater.getState(),
    checkForUpdates: async () => appUpdater.checkForUpdates(),
    quitAndInstall: async () => {
      await appUpdater.quitAndInstall();
    },
  });

  const sendFullscreenChanged = () => {
    if (mainWindow.isDestroyed()) return;
    mainWindow.webContents.send(eventsContract.channels.fullscreenChanged, {
      isFullscreen: mainWindow.isFullScreen(),
    });
  };

  mainWindow.on('enter-full-screen', sendFullscreenChanged);
  mainWindow.on('leave-full-screen', sendFullscreenChanged);

  // 5. Register close confirmation dialog
  mainWindow.on('close', (event) => {
    if (skipCloseConfirmation) {
      skipCloseConfirmation = false;
      return;
    }

    event.preventDefault();
    dialog
      .showMessageBox(mainWindow, {
        type: 'question',
        buttons: ['Quit', 'Cancel'],
        defaultId: 1,
        cancelId: 1,
        title: 'Confirm Quit',
        message: 'Are you sure you want to quit the application?',
      })
      .then(({ response }) => {
        if (response === 0) {
          mainWindow.destroy();
        }
      });
  });

  return appUpdater;
}
