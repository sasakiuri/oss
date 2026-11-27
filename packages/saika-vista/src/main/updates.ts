// SPDX-License-Identifier: MIT
import { UpdaterService } from '@sasakiuri/saika-updater/main';
import { app, dialog, type BrowserWindow } from 'electron';

import { VISTA_CHANNEL } from '../shared/ipcChannels';

/** Shutdown progress shared by normal quit and update installation. */
export interface ShutdownState {
  /** Vista is stopping for good, so a quit is no longer intercepted to stop the application first. */
  quitting: boolean;
  /** Vista is stopping to install an update, so operator commands and normal quit are refused. */
  preparingUpdate: boolean;
}

/**
 * The update service. Installing asks the operator, stops the application and releases the
 * single-instance lock first. An installer error after that restarts the current version once.
 */
export function createUpdater({
  shutdown,
  operator,
  stop,
}: {
  shutdown: ShutdownState;
  /** The operator window while it exists. */
  operator: () => BrowserWindow | null;
  /** Stops the running application. */
  stop: () => Promise<void>;
}): UpdaterService {
  let recoveringUpdate = false;
  let updateShutdown: Promise<void> | null = null;
  return new UpdaterService({
    isPackaged: app.isPackaged,
    currentVersion: app.getVersion(),
    metadataNamespace: 'vista',
    autoInstallOnAppQuit: false,
    onStateChange: (state) => {
      const window = operator();
      if (window && !window.isDestroyed()) window.webContents.send(VISTA_CHANNEL.updatesChanged, state);
      if (state.status === 'error' && shutdown.preparingUpdate && !recoveringUpdate) {
        recoveringUpdate = true;
        setImmediate(() => {
          void (updateShutdown ?? Promise.resolve())
            .catch(() => undefined)
            .then(() => {
              dialog.showErrorBox(
                'Vista update could not be installed',
                `${state.errorMessage ?? 'Installation failed.'}\nVista will restart with the current version.`,
              );
              shutdown.quitting = true;
              app.relaunch();
              app.quit();
            });
        });
      }
    },
    beforeInstall: async () => {
      const window = operator();
      if (!window || window.isDestroyed()) throw new Error('Open the operator window to install the update.');
      const confirmation = await dialog.showMessageBox(window, {
        type: 'question',
        title: 'Install Vista update',
        message: 'Restart Vista and install the downloaded update?',
        detail:
          'Audience windows on this PC will close. Connected display PCs will briefly lose their controller connection.',
        buttons: ['Restart and install', 'Cancel'],
        defaultId: 1,
        cancelId: 1,
      });
      if (confirmation.response !== 0) throw new Error('Update installation was cancelled.');
      if (shutdown.quitting) throw new Error('Vista is already shutting down.');
      shutdown.preparingUpdate = true;
      updateShutdown = stop();
      await updateShutdown;
      app.releaseSingleInstanceLock();
      shutdown.quitting = true;
    },
  });
}
