// SPDX-License-Identifier: MIT
import { join } from 'path';
import type { EventEmitter } from 'node:events';

import { BrowserWindow, type BrowserWindowConstructorOptions } from 'electron';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { WindowManager } from '@/main/infrastructure/window/WindowManager';
import type { BoardType } from '@/shared/types/BoardWindowConfig';

interface WindowStub extends EventEmitter {
  options: BrowserWindowConstructorOptions;
  destroyed: boolean;
  closeImmediately: boolean;
  close: Mock;
  finishClose(): void;
  isDestroyed: Mock;
  loadFile: Mock;
  loadURL: Mock;
  webContents: { send: Mock; on: Mock; getURL: Mock; setWindowOpenHandler: Mock };
}

const mocks = vi.hoisted(() => ({
  app: { isPackaged: true },
  windows: [] as WindowStub[],
  loadError: undefined as Error | undefined,
  logError: vi.fn(),
}));

vi.mock('@/shared/utils/Logger', () => ({
  Logger: { create: () => ({ logError: mocks.logError }) },
}));

vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events');
  return {
    app: mocks.app,
    BrowserWindow: class extends EventEmitter implements WindowStub {
      destroyed = false;
      closeImmediately = true;
      isDestroyed = vi.fn(() => this.destroyed);
      loadFile = vi.fn(() => (mocks.loadError ? Promise.reject(mocks.loadError) : Promise.resolve()));
      loadURL = vi.fn(() => (mocks.loadError ? Promise.reject(mocks.loadError) : Promise.resolve()));
      webContents = {
        send: vi.fn(),
        on: vi.fn(),
        getURL: vi.fn(() => ''),
        setWindowOpenHandler: vi.fn(),
      };
      close = vi.fn(() => {
        if (this.closeImmediately) this.finishClose();
      });

      constructor(readonly options: BrowserWindowConstructorOptions = {}) {
        super();
        mocks.windows.push(this);
      }

      finishClose(): void {
        this.destroyed = true;
        this.emit('closed');
      }
    },
  };
});

function mainWindow(manager: WindowManager): WindowStub {
  const window = new BrowserWindow();
  manager.registerMainWindow(window);
  return mocks.windows.at(-1)!;
}

describe('WindowManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.windows.length = 0;
    mocks.app.isPackaged = true;
    mocks.loadError = undefined;
    vi.stubEnv('VITE_DEV_SERVER_URL', 'http://localhost:5173/');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('loads boards from the injected renderer directory even when Electron starts from a built entry file', () => {
    const windows = new WindowManager('/suite/dist/preload/preload.mjs', '/suite/dist/renderer');
    const id = windows.createBoardWindow('ranking-board', { type: 'ranking-board' });
    const board = mocks.windows[0]!;
    expect(board.loadFile).toHaveBeenCalledWith(join('/suite/dist/renderer', 'board.html'), {
      query: { windowId: id, type: 'ranking-board' },
    });
    expect(board.loadURL).not.toHaveBeenCalled();
    expect(board.options.webPreferences).toEqual({
      preload: '/suite/dist/preload/preload.mjs',
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    });
    expect(board.webContents.setWindowOpenHandler.mock.calls[0]![0]()).toEqual({ action: 'deny' });
  });

  it('loads unpackaged boards from the configured development server', () => {
    mocks.app.isPackaged = false;
    const windows = new WindowManager('/suite/preload.mjs', '/suite/renderer');
    const id = windows.createBoardWindow('target-board', { type: 'target-board', laneRange: { from: 1, to: 10 } });
    expect(mocks.windows[0]!.loadURL).toHaveBeenCalledWith(
      `http://localhost:5173/board.html?windowId=${id}&type=target-board`,
    );
    expect(mocks.windows[0]!.loadFile).not.toHaveBeenCalled();
  });

  it.each<[BoardType, string]>([
    ['target-board', 'Target Board'],
    ['ranking-board', 'Ranking Board'],
    ['results-board', 'Results Board'],
    ['score-sheet-print', 'Print Score Sheets'],
    ['results-list-print', 'Print Results List'],
    ['incident-report-print', 'Print Range Incident Report'],
    ['protest-print', 'Print Protest or Appeal'],
    ['est-backup-source-print', 'Print Retained EST Backup Source'],
    ['final-board', 'Final Board'],
  ])('identifies %s windows with the corresponding user-facing title', (type, title) => {
    const windows = new WindowManager('/suite/preload.mjs', '/suite/renderer');
    windows.createBoardWindow(type, { type });
    expect(mocks.windows[0]!.options.title).toBe(title);
  });

  it('rejects mismatched board configuration before creating a native window', () => {
    const windows = new WindowManager('/suite/preload.mjs', '/suite/renderer');
    expect(() => windows.createBoardWindow('ranking-board', { type: 'target-board' })).toThrow('Board type mismatch');
    expect(mocks.windows).toHaveLength(0);
  });

  it('tracks board identity and configuration, cleans up on close, and permits recreation', () => {
    const windows = new WindowManager('/suite/preload.mjs', '/suite/renderer');
    const main = mainWindow(windows);
    const config = { type: 'target-board' as const, laneRange: { from: 2, to: 8 } };
    const id = windows.createBoardWindow(config.type, config);
    const board = mocks.windows[1]!;
    expect(windows.getWindowConfig(id)).toEqual(config);
    expect(windows.getWindowConfig('main')).toBeNull();
    expect(windows.getWindowConfig('missing')).toBeNull();
    expect(windows.getWindowsByType('target-board')).toEqual([id]);
    expect(windows.getWindowsByType('ranking-board')).toEqual([]);
    expect(windows.findWindowIdByWebContents(main.webContents as unknown as Electron.WebContents)).toBe('main');
    expect(windows.findWindowIdByWebContents(board.webContents as unknown as Electron.WebContents)).toBe(id);
    expect(windows.findWindowIdByWebContents({} as Electron.WebContents)).toBeNull();

    windows.closeBoardWindow('main');
    windows.closeBoardWindow('missing');
    expect(main.close).not.toHaveBeenCalled();
    windows.closeBoardWindow(id);
    expect(board.close).toHaveBeenCalledOnce();
    expect(windows.getWindowConfig(id)).toBeNull();
    expect(windows.getWindowsByType('target-board')).toEqual([]);
    expect(windows.findWindowIdByWebContents(board.webContents as unknown as Electron.WebContents)).toBeNull();

    const replacement = windows.createBoardWindow(config.type, config);
    expect(replacement).not.toBe(id);
    expect(windows.getWindowsByType('target-board')).toEqual([replacement]);
    main.finishClose();
    expect(windows.findWindowIdByWebContents(main.webContents as unknown as Electron.WebContents)).toBeNull();
  });

  it('continues broadcasting past destroyed windows and native delivery failures', () => {
    const windows = new WindowManager('/suite/preload.mjs', '/suite/renderer');
    const main = mainWindow(windows);
    const first = windows.createBoardWindow('ranking-board', { type: 'ranking-board' });
    windows.createBoardWindow('results-board', { type: 'results-board' });
    const destroyed = mocks.windows[1]!;
    const healthy = mocks.windows[2]!;
    destroyed.destroyed = true;
    main.webContents.send.mockImplementationOnce(() => {
      throw new Error('Renderer is closing');
    });
    const payload = { state: 'updated' };
    expect(() => windows.broadcast('state:changed', payload)).not.toThrow();
    expect(main.webContents.send).toHaveBeenCalledWith('state:changed', payload);
    expect(destroyed.webContents.send).not.toHaveBeenCalled();
    expect(healthy.webContents.send).toHaveBeenCalledWith('state:changed', payload);
    expect(windows.findWindowIdByWebContents(destroyed.webContents as unknown as Electron.WebContents)).toBeNull();
    expect(windows.getWindowsByType('ranking-board')).toEqual([first]);
  });

  it('waits for every board to release native resources while keeping the main window open', async () => {
    const windows = new WindowManager('/suite/preload.mjs', '/suite/renderer');
    const main = mainWindow(windows);
    windows.createBoardWindow('ranking-board', { type: 'ranking-board' });
    windows.createBoardWindow('results-board', { type: 'results-board' });
    windows.createBoardWindow('target-board', { type: 'target-board' });
    const [first, second, destroyed] = mocks.windows.slice(1) as [WindowStub, WindowStub, WindowStub];
    first.closeImmediately = false;
    second.closeImmediately = false;
    destroyed.destroyed = true;
    const completed = vi.fn();
    const closing = windows.closeAllBoardWindows().then(completed);
    expect(main.close).not.toHaveBeenCalled();
    expect(destroyed.close).not.toHaveBeenCalled();
    expect(first.close).toHaveBeenCalledOnce();
    expect(second.close).toHaveBeenCalledOnce();
    await Promise.resolve();
    expect(completed).not.toHaveBeenCalled();
    first.finishClose();
    await Promise.resolve();
    expect(completed).not.toHaveBeenCalled();
    second.finishClose();
    await closing;
    expect(completed).toHaveBeenCalledOnce();
    expect(windows.getWindowsByType('ranking-board')).toEqual([]);
    expect(windows.getWindowsByType('results-board')).toEqual([]);
    await windows.closeAllBoardWindows();
    expect(first.close).toHaveBeenCalledOnce();
    expect(second.close).toHaveBeenCalledOnce();
  });

  it.each([false, true])(
    'logs failed loads and closes only surviving board windows (already closed: %s)',
    async (closed) => {
      mocks.loadError = new Error('Renderer assets could not be loaded');
      const windows = new WindowManager('/suite/preload.mjs', '/suite/renderer');
      const id = windows.createBoardWindow('ranking-board', { type: 'ranking-board' });
      const board = mocks.windows[0]!;
      if (closed) board.finishClose();
      await Promise.resolve();
      expect(mocks.logError).toHaveBeenCalledWith(`Failed to load board window ${id}`, mocks.loadError);
      expect(board.close).toHaveBeenCalledTimes(closed ? 0 : 1);
      expect(windows.getWindowConfig(id)).toBeNull();
      expect(windows.getWindowsByType('ranking-board')).toEqual([]);
    },
  );
});
