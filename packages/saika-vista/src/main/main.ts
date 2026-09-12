// SPDX-License-Identifier: MIT
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { UpdaterService } from '@sasakiuri/saika-updater/main';
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeTheme,
  powerMonitor,
  powerSaveBlocker,
  screen,
  type IpcMainInvokeEvent,
} from 'electron';
import { z } from 'zod';

import type { ScreenConfig } from '../shared/model';

import { setLoginStart } from './loginStart';
import { VistaApplication } from './VistaApplication';

const directory = dirname(fileURLToPath(import.meta.url));
const appIcon = join(directory, '../../resources/appIcon.png');
nativeTheme.themeSource = 'dark';
// Test harnesses isolate userData through an explicit command-line switch.
const dataDirectory = app.commandLine.getSwitchValue('vista-data-dir');
if (dataDirectory) app.setPath('userData', dataDirectory);
let application: VistaApplication | null = null;
let operator: BrowserWindow | null = null;
const outputs = new Map<string, { window: BrowserWindow; revision: number | null; renderedAt: number }>();
let powerBlock: number | null = null;
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
    if (operator && !operator.isDestroyed()) operator.webContents.send('vista:updates-changed', state);
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

function protect(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  window.webContents.session.setPermissionCheckHandler(() => false);
}

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
      preload: join(directory, '../preload/preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  protect(operator);
  operator.on('closed', () => {
    operator = null;
  });
  void load(operator).catch((error: Error) => dialog.showErrorBox('Saika Vista', error.message));
}

function maintainPower(): void {
  if (outputs.size && powerBlock === null) powerBlock = powerSaveBlocker.start('prevent-display-sleep');
  else if (!outputs.size && powerBlock !== null) {
    powerSaveBlocker.stop(powerBlock);
    powerBlock = null;
  }
}

function openOutput(config: ScreenConfig): void {
  const display = screen.getAllDisplays().find((monitor) => String(monitor.id) === config.monitorId);
  if (!display) throw new Error('The saved monitor is not connected. Select the replacement monitor explicitly.');
  const existing = outputs.get(config.id);
  if (existing) {
    existing.window.setBounds(display.bounds);
    existing.window.setFullScreen(true);
    existing.window.showInactive();
    if (existing.window.webContents.isCrashed())
      void load(existing.window, config.id).catch((error: Error) => dialog.showErrorBox('Saika Vista', error.message));
    else existing.window.webContents.send('vista:changed');
    return;
  }
  const window = new BrowserWindow({
    ...display.bounds,
    title: config.name,
    icon: appIcon,
    backgroundColor: '#10191d',
    frame: false,
    fullscreen: true,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: join(directory, '../preload/preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  protect(window);
  outputs.set(config.id, { window, revision: null, renderedAt: 0 });
  window.on('ready-to-show', () => window.showInactive());
  window.on('closed', () => {
    outputs.delete(config.id);
    maintainPower();
    operator?.webContents.send('vista:changed');
  });
  window.webContents.on('render-process-gone', () => {
    const output = outputs.get(config.id);
    if (output) {
      output.revision = null;
      output.renderedAt = 0;
    }
  });
  window.webContents.on('unresponsive', () => {
    const output = outputs.get(config.id);
    if (output) output.renderedAt = 0;
  });
  void load(window, config.id).catch((error: Error) => dialog.showErrorBox('Saika Vista', error.message));
  maintainPower();
}

function requireApplication(): VistaApplication {
  if (!application) throw new Error('Vista is starting');
  return application;
}
function isMainFrame(event: IpcMainInvokeEvent): boolean {
  return event.senderFrame === event.sender.mainFrame;
}
function requireOperator(event: IpcMainInvokeEvent): VistaApplication {
  if (!isMainFrame(event) || event.sender !== operator?.webContents)
    throw new Error('This operation requires the local operator window');
  if (preparingUpdate) throw new Error('Vista is restarting to install an update.');
  return requireApplication();
}
function outputFor(event: IpcMainInvokeEvent) {
  const entry = [...outputs.entries()].find(([, output]) => output.window.webContents === event.sender);
  if (!isMainFrame(event) || !entry) throw new Error('This operation requires an audience window');
  return entry;
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
      ipcMain.handle('vista:state', (event) => requireOperator(event).view());
      ipcMain.handle('vista:command', (event, input: unknown) => requireOperator(event).command(input));
      ipcMain.handle('vista:discover', (event) => requireOperator(event).discover());
      ipcMain.handle('vista:updates-state', (event) => {
        requireOperator(event);
        return updater.getState();
      });
      ipcMain.handle('vista:updates-check', (event) => {
        requireOperator(event);
        return updater.checkForUpdates();
      });
      ipcMain.handle('vista:updates-install', (event) => {
        requireOperator(event);
        return updater.quitAndInstall();
      });
      ipcMain.handle('vista:audience', (event) => requireApplication().state.audience(outputFor(event)[0]));
      ipcMain.handle('vista:rendered', (event, input: unknown) => {
        const [id, output] = outputFor(event);
        const revision = z.number().int().positive().parse(input);
        if (requireApplication().state.document.screens.find((config) => config.id === id)?.revision !== revision)
          return;
        output.revision = revision;
        output.renderedAt = Date.now();
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
        open: openOutput,
        close: (id) => outputs.get(id)?.window.close(),
        status: (id) => {
          const output = outputs.get(id);
          return { revision: output?.revision ?? null, alive: !!output && Date.now() - output.renderedAt < 4000 };
        },
        loginStart: setLoginStart,
        changed: () => {
          if (operator && !operator.isDestroyed()) operator.webContents.send('vista:changed');
          for (const output of outputs.values())
            if (!output.window.isDestroyed()) output.window.webContents.send('vista:changed');
        },
      });
      void updater.checkForUpdates();
      screen.on('display-removed', (_event, removed) => {
        for (const config of requireApplication().state.document.screens)
          if (config.monitorId === String(removed.id)) outputs.get(config.id)?.window.close();
        operator?.webContents.send('vista:changed');
      });
      screen.on('display-added', () => operator?.webContents.send('vista:changed'));
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
