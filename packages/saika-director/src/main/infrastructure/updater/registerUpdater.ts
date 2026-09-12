// SPDX-License-Identifier: MIT
import type { UpdaterService } from '@sasakiuri/saika-updater/main';
import { BrowserWindow, dialog } from 'electron';
import type { WindowManager } from '@/main/infrastructure/window/WindowManager';
import type { IpcRouter } from '@/main/shared-infra/ipc/IpcRouter';
import { updaterContract } from '@/shared/ipc/contracts/updater.contract';
import { Logger } from '@/shared/utils/Logger';

const logger = Logger.create('Updater');

export function registerUpdater(router: IpcRouter, updater: UpdaterService, windowManager: WindowManager): void {
  let installRequested = false;
  const mainWindow = (event: unknown): BrowserWindow => {
    const { sender, senderFrame } = event as Electron.IpcMainInvokeEvent;
    if (windowManager.findWindowIdByWebContents(sender) !== 'main' || senderFrame !== sender.mainFrame) {
      throw new Error('Application updates are available only from the main window');
    }
    const window = BrowserWindow.fromWebContents(sender);
    if (!window || window.isDestroyed()) throw new Error('The main window is unavailable');
    return window;
  };
  router.register(updaterContract, {
    getUpdateState: async (event) => {
      mainWindow(event);
      return updater.getState();
    },
    checkForUpdates: async (event) => {
      mainWindow(event);
      return updater.checkForUpdates();
    },
    quitAndInstall: async (event) => {
      const window = mainWindow(event);
      if (installRequested) return;
      if (!updater.getState().canInstallUpdate) throw new Error('No downloaded update is ready to install');
      const response = dialog.showMessageBoxSync(window, {
        type: 'question',
        buttons: ['Restart and install', 'Cancel'],
        defaultId: 1,
        cancelId: 1,
        title: 'Install update',
        message: 'Restart Saika Director to install the update?',
        detail:
          'Competition control and Lane connections will stop. Board windows will close, and Vista displays will lose their live connection. Restart only after competition operations have stopped safely.',
      });
      if (response !== 0) return;
      installRequested = true;
      // Finish the IPC response and operator audit before shutdown closes the database.
      setImmediate(() => {
        void updater.quitAndInstall().catch((error: unknown) => {
          installRequested = false;
          logger.logError('Failed to install the application update', error);
        });
      });
    },
  });
}
