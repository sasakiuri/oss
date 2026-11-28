// SPDX-License-Identifier: MIT
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { app, BrowserWindow, dialog, nativeTheme, powerMonitor, screen } from 'electron';

import { VISTA_CHANNEL } from '../shared/ipcChannels';

import { registerIpcHandlers } from './ipcHandlers';
import { setLoginStart } from './loginStart';
import { OutputWindows } from './OutputWindows';
import { protectWindow } from './protectWindow';
import { rendererLoader } from './rendererLoader';
import { createUpdater, type ShutdownState } from './updates';
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
const shutdown: ShutdownState = { quitting: false, preparingUpdate: false };
const loadRenderer = rendererLoader(join(directory, '../renderer/index.html'), () => shutdown.quitting);
const outputs = new OutputWindows({
  icon: appIcon,
  preload,
  load: loadRenderer,
  closed: notifyOperator,
});
const updater = createUpdater({ shutdown, operator: () => operator, stop: () => requireApplication().stop() });

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
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  protectWindow(operator);
  operator.on('closed', () => {
    operator = null;
  });
  loadRenderer(operator);
}

/** Asks the operator window, while it is open, to reload its state. */
function notifyOperator(): void {
  if (operator && !operator.isDestroyed()) operator.webContents.send(VISTA_CHANNEL.changed);
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
    if (shutdown.quitting || !application) return;
    event.preventDefault();
    if (shutdown.preparingUpdate) return;
    shutdown.quitting = true;
    void application.stop().finally(() => app.quit());
  });
  void app
    .whenReady()
    .then(async () => {
      registerIpcHandlers({
        application: requireApplication,
        operator: () => operator?.webContents,
        updating: () => shutdown.preparingUpdate,
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
          notifyOperator();
          outputs.notify();
        },
      });
      void updater.checkForUpdates();
      screen.on('display-removed', (_event, removed) => {
        for (const config of requireApplication().state.document.screens)
          if (config.monitorId === String(removed.id)) outputs.close(config.id);
        notifyOperator();
      });
      screen.on('display-added', notifyOperator);
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
