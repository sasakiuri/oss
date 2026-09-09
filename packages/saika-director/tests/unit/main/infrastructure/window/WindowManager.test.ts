// SPDX-License-Identifier: MIT
import { join } from 'path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WindowManager } from '@/main/infrastructure/window/WindowManager';

const mocks = vi.hoisted(() => ({
  loadFile: vi.fn().mockResolvedValue(undefined),
  loadURL: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('electron', () => ({
  app: { isPackaged: true },
  BrowserWindow: class {
    loadFile = mocks.loadFile;
    loadURL = mocks.loadURL;
    on = vi.fn();
    webContents = { on: vi.fn(), setWindowOpenHandler: vi.fn() };
  },
}));

describe('WindowManager asset paths', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads boards from the injected renderer directory even when Electron starts from a built entry file', () => {
    const windows = new WindowManager('/suite/dist/preload/preload.mjs', '/suite/dist/renderer');
    const id = windows.createBoardWindow('ranking-board', { type: 'ranking-board' });
    expect(mocks.loadFile).toHaveBeenCalledWith(join('/suite/dist/renderer', 'board.html'), {
      query: { windowId: id, type: 'ranking-board' },
    });
    expect(mocks.loadURL).not.toHaveBeenCalled();
  });
});
