// SPDX-License-Identifier: MIT
import { app, dialog, type BrowserWindow } from 'electron';

/**
 * Returns a function that loads the renderer into a window: the operator, or the audience view of a
 * screen. A failed load opens an error dialog unless the window has closed or Vista is quitting.
 */
export function rendererLoader(
  indexFile: string,
  quitting: () => boolean,
): (window: BrowserWindow, screenId?: string) => void {
  async function load(window: BrowserWindow, screenId?: string): Promise<void> {
    try {
      const dev = process.env.VITE_DEV_SERVER_URL;
      if (!app.isPackaged && dev) {
        const url = new URL(dev);
        if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1')
          throw new Error('The development renderer must be local');
        if (screenId) url.searchParams.set('screen', screenId);
        await window.loadURL(url.href);
      } else await window.loadFile(indexFile, { query: screenId ? { screen: screenId } : {} });
    } catch (error) {
      // Closing a loading window rejects its load promise. Shutdown must not open a blocking error dialog.
      if (!quitting() && !window.isDestroyed()) throw error;
    }
  }
  return (window, screenId) => {
    void load(window, screenId).catch((error: Error) => dialog.showErrorBox('Saika Vista', error.message));
  };
}
