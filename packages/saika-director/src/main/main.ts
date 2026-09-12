import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { app, BrowserWindow, dialog } from 'electron';

// Logger configuration must be done before any Logger.create() calls
import { hardenBrowserWindow } from '@/main/infrastructure/window/hardenBrowserWindow';
import { resolveDevServerUrl } from '@/main/infrastructure/window/resolveDevServerUrl';
import { FileTransport } from '@/shared/logging/FileTransport';
import { Logger } from '@/shared/utils/Logger';

Logger.configure({
  minLevel: app.isPackaged ? 'INFO' : 'DEBUG',
  consoleOutput: true,
  fileTransport: new FileTransport({
    logDirectory: app.getPath('logs'),
  }),
});

const crashLogger = Logger.create('CrashHandler');

process.on('uncaughtException', (error: Error, origin: string) => {
  crashLogger.logError(`Uncaught exception [${origin}]`, error);
  Logger.flush();
  try {
    // showErrorBox blocks synchronously, giving the asynchronous log flush time to finish.
    dialog.showErrorBox(
      'Unexpected Error',
      `The application encountered an unexpected error.\n\n${error.message}\n\nPlease restart the application.`,
    );
    process.exit(1);
  } catch {
    // If dialogs are unavailable, wait briefly for the log flush before exiting.
    setTimeout(() => process.exit(1), 200);
  }
});

process.on('unhandledRejection', (reason: unknown) => {
  crashLogger.logError('Unhandled promise rejection', reason instanceof Error ? reason : new Error(String(reason)));
  Logger.flush();
  // Wait briefly for the asynchronous log flush before exiting.
  setTimeout(() => process.exit(1), 200);
});

import { createApp } from './composition/createContainer';
import { applyPendingDatabaseRestoreSync } from './modules/operational-archives';

const appDir = dirname(fileURLToPath(import.meta.url));
const preloadPath = join(appDir, '../preload/preload.mjs');
const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  const userDataPath = app.getPath('userData');
  const restoreResult = applyPendingDatabaseRestoreSync(join(userDataPath, 'saika.db'), userDataPath);
  if (restoreResult.error) {
    crashLogger.error('Pending database restore was not applied', { error: restoreResult.error });
  } else if (restoreResult.applied) {
    crashLogger.info('Pending database restore applied', {
      sourceFileName: restoreResult.sourceFileName,
      recoveryPath: restoreResult.recoveryPath,
    });
  }
  const services = createApp(preloadPath, {
    beforeInstall: prepareUpdateInstall,
    onInstallError: recoverUpdateInstall,
  });
  let mainWindow: BrowserWindow | null = null;
  let lifecycleStarted = false;
  let isQuitting = false;
  let shutdownComplete = false;
  let shutdownPromise: Promise<void> | null = null;
  let preparingUpdate = false;
  let updateRecoveryStarted = false;

  function createWindow(): void {
    mainWindow = new BrowserWindow({
      width: 1280,
      height: 800,
      webPreferences: {
        preload: preloadPath,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });
    hardenBrowserWindow(mainWindow);
    services.windowManager.registerMainWindow(mainWindow);

    const devServerUrl = resolveDevServerUrl(app.isPackaged, process.env.VITE_DEV_SERVER_URL);
    const loadingWindow = mainWindow;
    const loadPromise = devServerUrl
      ? loadingWindow.loadURL(devServerUrl)
      : loadingWindow.loadFile(join(appDir, '../renderer/index.html'));
    void loadPromise.catch((error) => {
      // Closing a loading window rejects the load promise; shutdown must not open an error dialog.
      if (isQuitting || loadingWindow.isDestroyed()) return;
      crashLogger.logError('Failed to load the main window', error);
      dialog.showErrorBox('Display Error', 'Failed to load the window. Please restart the application.');
    });

    mainWindow.on('close', (event) => {
      if (isQuitting || !mainWindow) return;
      const closesApplication = process.platform !== 'darwin';
      const cancelled =
        dialog.showMessageBoxSync(mainWindow, {
          type: 'question',
          buttons: [closesApplication ? 'Quit' : 'Close', 'Cancel'],
          defaultId: 1,
          cancelId: 1,
          title: closesApplication ? 'Confirm Quit' : 'Close Window',
          message: closesApplication ? 'Quit the application?' : 'Close this window?',
        }) === 1;
      if (cancelled) {
        event.preventDefault();
        return;
      }
      if (closesApplication) {
        // Quitting from the main window closes the entire app, including any board windows.
        event.preventDefault();
        app.quit();
      }
    });
    mainWindow.on('closed', () => {
      mainWindow = null;
    });
  }

  function shutdown(): Promise<void> {
    if (shutdownPromise) return shutdownPromise;
    isQuitting = true;
    shutdownPromise = (async () => {
      if (lifecycleStarted) {
        lifecycleStarted = false;
        await services.lifecycle.stopAll();
      }
      Logger.flush();
      shutdownComplete = true;
    })();
    return shutdownPromise;
  }

  async function prepareUpdateInstall(): Promise<void> {
    preparingUpdate = true;
    await shutdown();
    app.releaseSingleInstanceLock();
  }

  function recoverUpdateInstall(message: string): void {
    if (!preparingUpdate || updateRecoveryStarted) return;
    updateRecoveryStarted = true;
    void shutdown()
      .catch((error) => {
        crashLogger.logError('Update shutdown failed', error);
      })
      .then(() => {
        shutdownComplete = true;
        dialog.showErrorBox(
          'Update installation failed',
          `The update could not be installed. Saika Director will restart the current version to restore competition services.\n\n${message}`,
        );
        app.relaunch();
        app.quit();
      });
  }

  app.on('before-quit', (event) => {
    isQuitting = true;
    if (shutdownComplete) return;
    event.preventDefault();
    void shutdown().then(() => {
      // The installer owns quitting after its requested cleanup has finished.
      if (!preparingUpdate) app.quit();
    });
  });

  app.on('second-instance', () => {
    if (!lifecycleStarted) return;
    if (!mainWindow) createWindow();
    if (mainWindow?.isMinimized()) mainWindow.restore();
    mainWindow?.focus();
  });

  void app.whenReady().then(async () => {
    try {
      await services.lifecycle.startAll();
      lifecycleStarted = true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      dialog.showErrorBox('Startup Error', `Failed to start application services:\n${message}`);
      isQuitting = true;
      shutdownComplete = true;
      app.quit();
      return;
    }
    createWindow();
    void services.updater.checkForUpdates().catch((error: unknown) => {
      crashLogger.logError('Failed to check for application updates', error);
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('activate', () => {
    // Board windows can remain after the main window closes on macOS.
    // Recreate the main window based on its own presence rather than the total window count.
    if (lifecycleStarted && !mainWindow) createWindow();
  });
}
