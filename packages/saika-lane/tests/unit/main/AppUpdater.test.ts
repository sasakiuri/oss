// SPDX-License-Identifier: MIT
import { EventEmitter } from 'node:events';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const logger = {
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

vi.mock('electron', () => ({
  app: {
    isPackaged: true,
    getVersion: vi.fn(() => '0.2.1'),
  },
}));

vi.mock('@/main/shared-infra/logging', () => ({
  getLogger: () => logger,
}));

import { AppUpdater } from '@/main/updater/AppUpdater';

class FakeAutoUpdater extends EventEmitter {
  autoDownload = false;
  autoInstallOnAppQuit = false;
  allowPrerelease = false;
  allowDowngrade = false;
  checkForUpdates = vi.fn(async () => undefined);
  quitAndInstall = vi.fn();
}

function createMainWindowMock() {
  return {
    mainWindow: {
      isDestroyed: vi.fn(() => false),
      webContents: {
        send: vi.fn(),
        once: vi.fn(),
      },
    },
  };
}

describe('AppUpdater', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports unsupported state for non-packaged builds', async () => {
    const { mainWindow } = createMainWindowMock();
    const updater = new AppUpdater({
      mainWindow: mainWindow as never,
      isPackaged: false,
      currentVersion: '0.2.1',
    });

    const state = await updater.checkForUpdates();

    expect(state.status).toBe('unsupported');
    expect(state.canCheckForUpdates).toBe(false);
    expect(mainWindow.webContents.send).toHaveBeenCalledWith(
      'event:updateStateChanged',
      expect.objectContaining({
        status: 'unsupported',
      }),
    );
  });

  it('tracks download progress and marks the update ready for installation', async () => {
    const { mainWindow } = createMainWindowMock();
    const fakeAutoUpdater = new FakeAutoUpdater();
    fakeAutoUpdater.checkForUpdates.mockImplementationOnce(async () => {
      fakeAutoUpdater.emit('checking-for-update');
      fakeAutoUpdater.emit('update-available', {
        version: '0.2.2',
        releaseName: 'Saika Lane 0.2.2',
        releaseDate: '2026-04-23T00:00:00.000Z',
        releaseNotes: 'Bug fixes',
      });
      fakeAutoUpdater.emit('download-progress', {
        percent: 50,
        transferred: 2048,
        total: 4096,
        bytesPerSecond: 1024,
      });
      fakeAutoUpdater.emit('update-downloaded', {
        version: '0.2.2',
        releaseName: 'Saika Lane 0.2.2',
        releaseDate: '2026-04-23T00:00:00.000Z',
        releaseNotes: 'Bug fixes',
      });
    });

    const updater = new AppUpdater({
      mainWindow: mainWindow as never,
      currentVersion: '0.2.1',
      isPackaged: true,
      loadAutoUpdater: async () => ({ autoUpdater: fakeAutoUpdater }),
    });

    const state = await updater.checkForUpdates();

    expect(state.status).toBe('downloaded');
    expect(state.targetVersion).toBe('0.2.2');
    expect(state.canInstallUpdate).toBe(true);
    expect(fakeAutoUpdater.autoDownload).toBe(true);
    expect(fakeAutoUpdater.autoInstallOnAppQuit).toBe(true);
    expect(mainWindow.webContents.send).toHaveBeenCalledWith(
      'event:updateStateChanged',
      expect.objectContaining({
        status: 'downloaded',
        targetVersion: '0.2.2',
      }),
    );
  });

  it('bypasses close confirmation before installing a downloaded update', async () => {
    const { mainWindow } = createMainWindowMock();
    const fakeAutoUpdater = new FakeAutoUpdater();
    fakeAutoUpdater.checkForUpdates.mockImplementationOnce(async () => {
      fakeAutoUpdater.emit('update-downloaded', {
        version: '0.2.2',
      });
    });

    const onBeforeQuitForInstall = vi.fn();
    const updater = new AppUpdater({
      mainWindow: mainWindow as never,
      currentVersion: '0.2.1',
      isPackaged: true,
      loadAutoUpdater: async () => ({ autoUpdater: fakeAutoUpdater }),
      onBeforeQuitForInstall,
    });

    await updater.checkForUpdates();
    await updater.quitAndInstall();

    expect(onBeforeQuitForInstall).toHaveBeenCalledTimes(1);
    expect(fakeAutoUpdater.quitAndInstall).toHaveBeenCalledWith(false, true);
  });

  it('emits the current state to the renderer on demand', () => {
    const { mainWindow } = createMainWindowMock();
    const updater = new AppUpdater({
      mainWindow: mainWindow as never,
      currentVersion: '0.2.1',
      isPackaged: true,
    });

    updater.emitCurrentState();

    expect(mainWindow.webContents.send).toHaveBeenCalledWith(
      'event:updateStateChanged',
      expect.objectContaining({
        currentVersion: '0.2.1',
        status: 'idle',
      }),
    );
  });
});
