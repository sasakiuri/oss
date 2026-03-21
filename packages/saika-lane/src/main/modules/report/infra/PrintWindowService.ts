// SPDX-License-Identifier: MIT
import { join } from 'path';

import { app, BrowserWindow } from 'electron';

/**
 * Print window management service
 *
 * Creates a BrowserWindow and loads print.html.
 * Paths are received via DI from the caller (main.ts).
 */
export class PrintWindowService {
  private printWindow: BrowserWindow | null = null;
  private readonly preloadPath: string;
  private readonly rendererDir: string;

  constructor(preloadPath: string, rendererDir: string) {
    this.preloadPath = preloadPath;
    this.rendererDir = rendererDir;
  }

  async open(sessionId: string): Promise<void> {
    // Close existing window if present
    if (this.printWindow && !this.printWindow.isDestroyed()) {
      this.printWindow.close();
    }

    this.printWindow = new BrowserWindow({
      width: 800,
      height: 1000,
      title: 'Score Sheet',
      webPreferences: {
        preload: this.preloadPath,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });

    // Security: prevent navigation to external URLs
    this.printWindow.webContents.on('will-navigate', (event, url) => {
      const devServerUrl = process.env.VITE_DEV_SERVER_URL;
      const isDevUrl = !app.isPackaged && devServerUrl != null && url.startsWith(devServerUrl);
      const isAllowedUrl = url.startsWith('file://') || isDevUrl;
      if (!isAllowedUrl) {
        event.preventDefault();
      }
    });

    // Security: block all new window requests
    this.printWindow.webContents.setWindowOpenHandler(() => {
      return { action: 'deny' };
    });

    // Load different URLs for dev vs prod
    if (process.env.VITE_DEV_SERVER_URL) {
      await this.printWindow.loadURL(
        `${process.env.VITE_DEV_SERVER_URL}/print.html?sessionId=${encodeURIComponent(sessionId)}`,
      );
    } else {
      await this.printWindow.loadFile(join(this.rendererDir, 'print.html'), { query: { sessionId } });
    }

    this.printWindow.on('closed', () => {
      this.printWindow = null;
    });
  }
}
