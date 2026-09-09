// SPDX-License-Identifier: MIT
import '@/main/shared-infra/compat/setupCjsCompat';

import { release } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { app, BrowserWindow } from 'electron';

import { createMainWindowOptions } from '@/main/createMainWindowOptions';
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
  const window = new BrowserWindow(
    createMainWindowOptions({
      isPackaged: app.isPackaged,
      preloadPath: join(appDir, '../preload/preload.mjs'),
      useNativeWindowFrame: isWsl,
    }),
  );

  // Capture renderer console.log and write to file
  window.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    const logMessage = `[renderer:${level}] ${message} (${sourceId}:${line})`;
    getLogger().debug(logMessage, 'renderer');
  });

  // Security: prevent navigation to external URLs
  window.webContents.on('will-navigate', (event, url) => {
    const devServerUrl = process.env.VITE_DEV_SERVER_URL;
    const isDevUrl = !app.isPackaged && devServerUrl != null && url.startsWith(devServerUrl);
    const isAllowedUrl = url.startsWith('file://') || isDevUrl;
    if (!isAllowedUrl) {
      event.preventDefault();
    }
  });

  // Security: block all new window requests
  window.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    window.loadURL(process.env.VITE_DEV_SERVER_URL);
    if (!app.isPackaged && process.env.OPEN_DEVTOOLS !== '0' && process.env.OPEN_DEVTOOLS !== 'false') {
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

// Quit on all platforms when all windows are closed.
// macOS dock reactivation (the `activate` event) requires proper window lifecycle
// management — rebinding IPC handlers, event forwarding, and window controls to the
// new window — which will be implemented in a future version.
app.whenReady().then(() => {
  const window = createWindow();
  createLaneApp(window, {
    userDataPath: app.getPath('userData'),
    preloadPath: join(appDir, '../preload/preload.mjs'),
    rendererDirectory: join(appDir, '../renderer'),
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
