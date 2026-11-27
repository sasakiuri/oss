// SPDX-License-Identifier: MIT
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { UpdaterService } from '@sasakiuri/saika-updater/main';
import { app, BrowserWindow, dialog, nativeTheme, powerMonitor, screen } from 'electron';

import { VISTA_CHANNEL } from '../shared/ipcChannels';

import { registerIpcHandlers } from './ipcHandlers';
import { setLoginStart } from './loginStart';
import { OutputWindows } from './OutputWindows';
import { isolatedWebPreferences, protectWindow } from './protectWindow';
import { VistaApplication } from './VistaApplication';

const directory = dirname(fileURLToPath(import.meta.url));
const appIcon = join(directory, '../../resources/appIcon.png');
const preload = join(directory, '../preload/preload.mjs');
nativeTheme.themeSource = 'dark';
// Test harnesses isolate userData through an explicit command-line switch.
const dataDirectory = app.commandLine.getSwitchValue('vista-data-dir');
if (dataDirectory) app.setPath('userData', dataDirectory);
let application: VistaApplication | null = null;
let operator: BrowserWindow | null = null;
const outputs = new OutputWindows({
  icon: appIcon,
  preload,
  load: loadAndReport,
  closed: () => operator?.webContents.send(VISTA_CHANNEL.changed),
});
let quitting = false;
let preparingUpdate = false;
let recoveringUpdate = false;
let updateShutdown: Promise<void> | null = null;
const updater = new UpdaterService({
  isPackaged: app.isPackaged,
  currentVersion: app.getVersion(),
  metadataNamespace: 'vista',
  autoInstallOnAppQuit: false,
  onStateChange: (state) => {
    if (operator && !operator.isDestroyed()) operator.webContents.send(VISTA_CHANNEL.updatesChanged, state);
    if (state.status === 'error' && preparingUpdate && !recoveringUpdate) {
      recoveringUpdate = true;
      setImmediate(() => {
        void (updateShutdown ?? Promise.resolve())
          .catch(() => undefined)
          .then(() => {
            dialog.showErrorBox(
              'Vista update could not be installed',
              `${state.errorMessage ?? 'Installation failed.'}\nVista will restart with the current version.`,
            );
            quitting = true;
            app.relaunch();
            app.quit();
          });
      });
    }
  },
  beforeInstall: async () => {
    if (!operator || operator.isDestroyed()) throw new Error('Open the operator window to install the update.');
    const confirmation = await dialog.showMessageBox(operator, {
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
    if (quitting) throw new Error('Vista is already shutting down.');
    preparingUpdate = true;
    updateShutdown = requireApplication().stop();
    await updateShutdown;
    app.releaseSingleInstanceLock();
    quitting = true;
  },
});

async function load(window: BrowserWindow, screenId?: string): Promise<void> {
  try {
    const dev = process.env.VITE_DEV_SERVER_URL;
    if (!app.isPackaged && dev) {
      const url = new URL(dev);
      if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1')
        throw new Error('The development renderer must be local');
      if (screenId) url.searchParams.set('screen', screenId);
      await window.loadURL(url.href);
    } else
      await window.loadFile(join(directory, '../renderer/index.html'), { query: screenId ? { screen: screenId } : {} });
  } catch (error) {
    // Closing a loading window rejects its load promise. Shutdown must not open a blocking error dialog.
    if (!quitting && !window.isDestroyed()) throw error;
  }
}
function loadAndReport(window: BrowserWindow, screenId?: string): void {
  void load(window, screenId).catch((error: Error) => dialog.showErrorBox('Saika Vista', error.message));
}

function createOperator(): void {
  if (operator) {
    operator.show();
    operator.focus();
    return;
  }
  operator = new BrowserWindow({
    width: 1380,
    height: 900,
    minWidth: 780,
    minHeight: 600,
    title: 'Saika Vista',
    icon: appIcon,
    backgroundColor: '#14191d',
    webPreferences: isolatedWebPreferences(preload),
  });
  protectWindow(operator);
  operator.on('closed', () => {
    operator = null;
  });
  loadAndReport(operator);
}

function requireApplication(): VistaApplication {
  if (!application) throw new Error('Vista is starting');
  return application;
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', createOperator);
  app.on('window-all-closed', () => {
    // A controller must be able to add screens again after removing the last one.
    if (!application?.state.document.controller) app.quit();
  });
  app.on('before-quit', (event) => {
    if (quitting || !application) return;
    event.preventDefault();
    if (preparingUpdate) return;
    quitting = true;
    void application.stop().finally(() => app.quit());
  });
  void app
    .whenReady()
    .then(async () => {
      registerIpcHandlers({
        application: requireApplication,
        operator: () => operator?.webContents,
        updating: () => preparingUpdate,
        updater,
        outputs,
      });
      application = await VistaApplication.start(app.getPath('userData'), {
        monitors: () =>
          screen.getAllDisplays().map((display) => ({
            id: String(display.id),
            name: display.label || `Monitor ${display.id}`,
            width: display.size.width,
            height: display.size.height,
            primary: display.id === screen.getPrimaryDisplay().id,
          })),
        open: (config) => outputs.open(config),
        close: (id) => outputs.close(id),
        status: (id) => outputs.status(id),
        loginStart: setLoginStart,
        changed: () => {
          if (operator && !operator.isDestroyed()) operator.webContents.send(VISTA_CHANNEL.changed);
          outputs.notify();
        },
      });
      void updater.checkForUpdates();
      screen.on('display-removed', (_event, removed) => {
        for (const config of requireApplication().state.document.screens)
          if (config.monitorId === String(removed.id)) outputs.close(config.id);
        operator?.webContents.send(VISTA_CHANNEL.changed);
      });
      screen.on('display-added', () => operator?.webContents.send(VISTA_CHANNEL.changed));
      powerMonitor.on('resume', () => {
        for (const entry of requireApplication().state.getEntries())
          void requireApplication()
            .state.updateEntry({ ...entry, state: 'stale', error: 'Resynchronizing after sleep' })
            .catch(() => undefined);
      });
      const primaryMonitorId = String(screen.getPrimaryDisplay().id);
      const primaryRestored = application.state.document.screens.some(
        (config) => config.monitorId === primaryMonitorId && outputs.has(config.id),
      );
      if (!primaryRestored) createOperator();
      app.on('activate', createOperator);
    })
    .catch((error: unknown) => {
      dialog.showErrorBox(
        'Saika Vista could not start',
        error instanceof Error ? error.message : 'Unknown startup error',
      );
      app.quit();
    });
}
