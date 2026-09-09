import { join } from 'path';

import { BrowserWindow, app } from 'electron';

import type { BoardType, BoardWindowConfig } from '@/shared/types/BoardWindowConfig';
import { Logger } from '@/shared/utils/Logger';

import { hardenBrowserWindow } from './hardenBrowserWindow';
import { resolveDevServerUrl } from './resolveDevServerUrl';

const logger = Logger.create('WindowManager');

// Re-export for backward compatibility
export type { BoardType, BoardWindowConfig };

/**
 * Window metadata.
 */
export interface WindowInfo {
  window: BrowserWindow;
  type: 'main' | BoardType;
  config?: BoardWindowConfig;
}

/**
 * Multi-window management service.
 *
 * Registers the main window, manages board windows, and broadcasts to all windows.
 */
export class WindowManager {
  private windows = new Map<string, WindowInfo>();

  /**
   * @param preloadPath Absolute path to the preload script.
   * @param rendererDirectory Absolute path to the built renderer assets.
   */
  constructor(
    private readonly preloadPath: string,
    private readonly rendererDirectory: string,
  ) {}

  /**
   * Registers the main window.
   * @param window Main window.
   */
  registerMainWindow(window: BrowserWindow): void {
    this.windows.set('main', {
      window,
      type: 'main',
    });

    window.on('closed', () => {
      this.windows.delete('main');
    });
  }

  /**
   * Creates a board window.
   * @param type Board type.
   * @param config Board configuration.
   * @returns Window ID (UUID).
   */
  createBoardWindow(type: BoardType, config: BoardWindowConfig): string {
    // Ensure the requested type matches config.type.
    if (config.type !== type) {
      throw new Error(`Board type mismatch: ${type} !== ${config.type}`);
    }

    const windowId = crypto.randomUUID();

    const boardWindow = new BrowserWindow({
      width: 1024,
      height: 768,
      webPreferences: {
        preload: this.preloadPath,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
      title: this.getBoardTitle(type),
    });
    hardenBrowserWindow(boardWindow);

    // Load board.html.
    const devServerUrl = resolveDevServerUrl(app.isPackaged, process.env.VITE_DEV_SERVER_URL);
    const loadPromise = devServerUrl
      ? // Development: load from the Vite dev server.
        boardWindow.loadURL(`${devServerUrl}board.html?windowId=${windowId}&type=${type}`)
      : // The composition root supplies the asset directory independently of Electron's launch path.
        boardWindow.loadFile(join(this.rendererDirectory, 'board.html'), {
          query: { windowId, type },
        });
    void loadPromise.catch((error) => {
      logger.logError(`Failed to load board window ${windowId}`, error);
      if (!boardWindow.isDestroyed()) boardWindow.close();
    });

    // Register window metadata.
    this.windows.set(windowId, {
      window: boardWindow,
      type,
      config,
    });

    // Remove the window from the map after it closes.
    boardWindow.on('closed', () => {
      this.windows.delete(windowId);
    });

    return windowId;
  }

  /**
   * Closes a board window.
   * @param windowId Window ID.
   */
  closeBoardWindow(windowId: string): void {
    const info = this.windows.get(windowId);
    if (info && info.type !== 'main') {
      info.window.close();
      // The closed event removes it from the map.
    }
  }

  /**
   * Broadcasts a message to every window.
   * @param channel IPC channel.
   * @param data Data to send.
   */
  broadcast(channel: string, data: unknown): void {
    for (const info of this.windows.values()) {
      try {
        if (!info.window.isDestroyed()) {
          info.window.webContents.send(channel, data);
        }
      } catch {
        // Ignore delivery failures for windows being destroyed and continue broadcasting.
      }
    }
  }

  /**
   * Gets a window configuration.
   * @param windowId Window ID.
   * @returns Board configuration, or null when absent.
   */
  getWindowConfig(windowId: string): BoardWindowConfig | null {
    const info = this.windows.get(windowId);
    return info?.config ?? null;
  }

  /**
   * Gets all window IDs for a board type.
   * @param type Board type.
   * @returns Window IDs.
   */
  getWindowsByType(type: BoardType): string[] {
    const result: string[] = [];
    for (const [id, info] of this.windows.entries()) {
      if (info.type === type) {
        result.push(id);
      }
    }
    return result;
  }

  /**
   * Closes all board windows and waits for their native resources to be released.
   */
  async closeAllBoardWindows(): Promise<void> {
    const boards = [...this.windows.values()].filter((info) => info.type !== 'main' && !info.window.isDestroyed());
    await Promise.all(
      boards.map(
        ({ window }) =>
          new Promise<void>((resolve) => {
            window.once('closed', () => resolve());
            window.close();
          }),
      ),
    );
  }

  /**
   * Gets a window ID from WebContents.
   * @param webContents Electron WebContents
   * @returns Window ID, or null when not found.
   */
  findWindowIdByWebContents(webContents: Electron.WebContents): string | null {
    for (const [id, info] of this.windows.entries()) {
      if (!info.window.isDestroyed() && info.window.webContents === webContents) {
        return id;
      }
    }
    return null;
  }

  /**
   * Gets the title for a board type.
   */
  private getBoardTitle(type: BoardType): string {
    switch (type) {
      case 'target-board':
        return 'Target Board';
      case 'ranking-board':
        return 'Ranking Board';
      case 'results-board':
        return 'Results Board';
      case 'score-sheet-print':
        return 'Print Score Sheets';
      case 'results-list-print':
        return 'Print Results List';
      case 'incident-report-print':
        return 'Print Range Incident Report';
      case 'protest-print':
        return 'Print Protest or Appeal';
      case 'est-backup-source-print':
        return 'Print Retained EST Backup Source';
      case 'final-board':
        return 'Final Board';
      default:
        return 'Board';
    }
  }
}
