// SPDX-License-Identifier: MIT
import type { BrowserWindow } from 'electron';

/** The isolated, sandboxed renderer settings of every Vista window. */
export function isolatedWebPreferences(preload: string) {
  return { preload, contextIsolation: true, nodeIntegration: false, sandbox: true };
}

/** Blocks new windows, navigation, webviews and permission requests for a Vista window. */
export function protectWindow(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  window.webContents.session.setPermissionCheckHandler(() => false);
}
