import type { BrowserWindow } from 'electron';

/** Blocks unintended external navigation and new-window creation from the renderer. */
export function hardenBrowserWindow(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, targetUrl) => {
    const currentUrl = window.webContents.getURL();
    if (!currentUrl) return;

    if (targetUrl !== currentUrl) event.preventDefault();
  });
}
