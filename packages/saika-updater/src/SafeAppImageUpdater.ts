// SPDX-License-Identifier: MIT
import { autoUpdater as nativeAutoUpdater } from 'electron';
import { AppImageUpdater } from 'electron-updater';

import { installAppImage } from './installAppImage';

// Used for applications that install only through their explicit restart action.
export class SafeAppImageUpdater extends AppImageUpdater {
  override async quitAndInstall(): Promise<void> {
    if (this.quitAndInstallCalled) {
      throw new Error('An AppImage update is already being installed.');
    }

    this.quitAndInstallCalled = true;
    try {
      const currentFile = process.env.APPIMAGE;
      const downloadedFile = this.installerPath;
      if (!currentFile || !downloadedFile || !this.downloadedUpdateHelper?.downloadedFileInfo) {
        throw new Error('The current AppImage or downloaded update is unavailable.');
      }
      const destination = await installAppImage(currentFile, downloadedFile, undefined, (error) => {
        this._logger.warn(`Could not remove obsolete AppImage update files: ${String(error)}`);
      });
      if (destination !== currentFile) this.emit('appimage-filename-updated', destination);
    } catch (error) {
      this.quitAndInstallCalled = false;
      const failure = error instanceof Error ? error : new Error(String(error));
      this.dispatchError(failure);
      throw failure;
    }

    nativeAutoUpdater.emit('before-quit-for-update');
    this.app.quit();
  }
}
