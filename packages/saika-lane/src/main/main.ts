// SPDX-License-Identifier: MIT
import '@/main/shared-infra/compat/setupCjsCompat';

import { release } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { app, BrowserWindow } from 'electron';

import { createMainWindow } from '@/main/createMainWindowOptions';
import { focusMainWindow } from '@/main/focusStartupWindow';
import { getLogger } from '@/main/shared-infra/logging';

import { createLaneApp } from './composition/createLaneApp';

const appDir = dirname(fileURLToPath(import.meta.url));
const isWsl =
  process.platform === 'linux' &&
  (Boolean(process.env.WSL_DISTRO_NAME) || release().toLowerCase().includes('microsoft'));
process.env.SAIKA_LANE_NATIVE_WINDOW_FRAME = isWsl ? '1' : '0';

if (isWsl) {
  app.commandLine.appendSwitch('ozone-platform', 'x11');
}

function createWindow(): BrowserWindow {
  const window = createMainWindow({
    isPackaged: app.isPackaged,
    preloadPath: join(appDir, '../preload/preload.mjs'),
    useNativeWindowFrame: isWsl,
  });

  // Capture renderer console.log and write to file
  window.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    const logMessage = `[renderer:${level}] ${message} (${sourceId}:${line})`;
    // Renderer errors, such as an event payload the preload rejected, stay visible at the default log level.
    if (level >= 3) {
      getLogger().error(logMessage, 'renderer');
      return;
    }
    getLogger().debug(logMessage, 'renderer');
  });

  if (!app.isPackaged && process.env.VITE_DEV_SERVER_URL) {
    window.loadURL(process.env.VITE_DEV_SERVER_URL);
    if (process.env.OPEN_DEVTOOLS !== '0' && process.env.OPEN_DEVTOOLS !== 'false') {
      window.webContents.openDevTools({ mode: 'detach' });
    }
  } else {
    window.loadFile(join(appDir, '../renderer/index.html'));
  }

  return window;
}

// Relax autoplay policy (required for impact sound playback)
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('audio-buffer-size', '128');

function startLane(): void {
  let mainWindow: BrowserWindow | null = null;

  // A second launch would open the same database and target port again; show the running Lane instead.
  app.on('second-instance', () => {
    if (mainWindow) focusMainWindow(mainWindow);
  });

  // Quit on all platforms when all windows are closed.
  // Reopening a window requires rebinding IPC handlers, event forwarding and window controls.
  app.whenReady().then(() => {
    mainWindow = createWindow();
    createLaneApp(mainWindow, {
      userDataPath: app.getPath('userData'),
      preloadPath: join(appDir, '../preload/preload.mjs'),
      rendererDirectory: join(appDir, '../renderer'),
    });
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}

if (app.requestSingleInstanceLock()) {
  startLane();
} else {
  app.quit();
}
