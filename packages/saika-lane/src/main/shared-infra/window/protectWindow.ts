// SPDX-License-Identifier: MIT
import type { BrowserWindow } from 'electron';

/**
 * Keeps a Lane window on the page main loaded into it: no new windows, no navigation to another page, no webviews
 * and no permission grants. Reloading the page it shows, as the development server does after a change, stays
 * allowed.
 */
export function protectWindow(window: BrowserWindow): void {
  const { webContents } = window;
  webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  webContents.on('will-navigate', (details) => details.url === webContents.getURL() || details.preventDefault());
  webContents.on('will-attach-webview', (event) => event.preventDefault());
  webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  webContents.session.setPermissionCheckHandler(() => false);
}
