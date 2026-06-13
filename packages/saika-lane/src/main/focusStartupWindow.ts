// SPDX-License-Identifier: MIT
import { app, type BrowserWindow } from 'electron';

const STARTUP_FOCUS_RETRY_DELAYS_MS = [250, 1000, 2500] as const;

export function focusStartupWindow(mainWindow: BrowserWindow): void {
  focusMainWindowNow(mainWindow);

  for (const delayMs of STARTUP_FOCUS_RETRY_DELAYS_MS) {
    setTimeout(() => {
      focusMainWindowNow(mainWindow);
    }, delayMs);
  }
}

function focusMainWindowNow(mainWindow: BrowserWindow): void {
  if (mainWindow.isDestroyed()) return;

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.show();

  if (process.platform === 'darwin') {
    app.focus({ steal: true });
  } else {
    app.focus();
  }

  mainWindow.focus();

  if (process.platform === 'win32' && !mainWindow.isFocused()) {
    mainWindow.setAlwaysOnTop(true);
    mainWindow.moveTop();
    mainWindow.focus();
    mainWindow.setAlwaysOnTop(false);
  }
}
