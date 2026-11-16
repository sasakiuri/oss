// SPDX-License-Identifier: MIT
import { EventEmitter } from 'node:events';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const nativeAutoUpdater = vi.hoisted(() => {
  const listeners = new Map<string, Set<() => void>>();

  return {
    on(event: string, listener: () => void) {
      const eventListeners = listeners.get(event) ?? new Set<() => void>();
      eventListeners.add(listener);
      listeners.set(event, eventListeners);
      return this;
    },
    emit(event: string) {
      for (const listener of listeners.get(event) ?? []) {
        listener();
      }
      return true;
    },
    removeAllListeners() {
      listeners.clear();
      return this;
    },
  };
});
const logger = {
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

const app = vi.hoisted(() => ({
  isPackaged: true,
  getVersion: vi.fn(() => '0.2.1'),
  releaseSingleInstanceLock: vi.fn(),
  requestSingleInstanceLock: vi.fn(() => true),
}));

vi.mock('electron', () => ({
  app,
  autoUpdater: nativeAutoUpdater,
}));

vi.mock('@/main/shared-infra/logging', () => ({
  getLogger: () => logger,
}));

// The electron-updater module as packaged on Linux: its updater is an AppImage updater.
const electronUpdater = vi.hoisted(() => {
  const instances: unknown[] = [];
  class AppImageUpdater {
    autoDownload = false;
    autoInstallOnAppQuit = true;
    allowPrerelease = false;
    allowDowngrade = true;
    on = vi.fn().mockReturnThis();
    checkForUpdates = vi.fn(async () => undefined);
    quitAndInstall = vi.fn();
    constructor() {
      instances.push(this);
    }
  }
  return { AppImageUpdater, instances, autoUpdater: new AppImageUpdater() };
});

vi.mock('electron-updater', () => ({
  AppImageUpdater: electronUpdater.AppImageUpdater,
  autoUpdater: electronUpdater.autoUpdater,
}));

import { AppUpdater } from '@/main/updater/AppUpdater';
import { eventsContract } from '@/shared/ipc/contracts';

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
        // The preload bridge drops payloads outside the event schema, so every state sent must match it.
        send: vi.fn((channel: string, payload: unknown) => {
          expect(channel).toBe(eventsContract.channels.updateStateChanged);
          expect(eventsContract.events.updateStateChanged.schema.safeParse(payload).error?.issues).toBeUndefined();
        }),
        once: vi.fn(),
      },
    },
  };
}

describe('AppUpdater', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nativeAutoUpdater.removeAllListeners();
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
    expect(fakeAutoUpdater.autoInstallOnAppQuit).toBe(false);
    expect(mainWindow.webContents.send).toHaveBeenCalledWith(
      'event:updateStateChanged',
      expect.objectContaining({
        status: 'downloaded',
        targetVersion: '0.2.2',
      }),
    );
  });

  it('installs a downloaded update only through the explicit restart action, not on a normal quit', async () => {
    const { mainWindow } = createMainWindowMock();
    const fakeAutoUpdater = new FakeAutoUpdater();
    fakeAutoUpdater.autoInstallOnAppQuit = true;
    fakeAutoUpdater.checkForUpdates.mockImplementationOnce(async () => {
      fakeAutoUpdater.emit('update-downloaded', { version: '0.2.2' });
    });
    const updater = new AppUpdater({
      mainWindow: mainWindow as never,
      currentVersion: '0.2.1',
      isPackaged: true,
      loadAutoUpdater: async () => ({ autoUpdater: fakeAutoUpdater }),
    });

    await updater.checkForUpdates();

    expect(updater.getState().canInstallUpdate).toBe(true);
    expect(fakeAutoUpdater.autoInstallOnAppQuit).toBe(false);
    expect(fakeAutoUpdater.quitAndInstall).not.toHaveBeenCalled();

    await updater.quitAndInstall();

    expect(fakeAutoUpdater.quitAndInstall).toHaveBeenCalledExactlyOnceWith(false, true);
  });

  it('releases the single-instance lock before installing so the updated Lane can start', async () => {
    const { mainWindow } = createMainWindowMock();
    const fakeAutoUpdater = new FakeAutoUpdater();
    fakeAutoUpdater.checkForUpdates.mockImplementationOnce(async () => {
      fakeAutoUpdater.emit('update-downloaded', { version: '0.2.2' });
    });
    fakeAutoUpdater.quitAndInstall.mockImplementationOnce(() => {
      expect(app.releaseSingleInstanceLock).toHaveBeenCalledOnce();
    });
    const updater = new AppUpdater({
      mainWindow: mainWindow as never,
      currentVersion: '0.2.1',
      isPackaged: true,
      loadAutoUpdater: async () => ({ autoUpdater: fakeAutoUpdater }),
    });
    await updater.checkForUpdates();

    await updater.quitAndInstall();

    expect(fakeAutoUpdater.quitAndInstall).toHaveBeenCalledOnce();
    expect(app.requestSingleInstanceLock).not.toHaveBeenCalled();
  });

  it('takes the single-instance lock back when the installation does not start', async () => {
    const { mainWindow } = createMainWindowMock();
    const fakeAutoUpdater = new FakeAutoUpdater();
    fakeAutoUpdater.checkForUpdates.mockImplementationOnce(async () => {
      fakeAutoUpdater.emit('update-downloaded', { version: '0.2.2' });
    });
    fakeAutoUpdater.quitAndInstall.mockImplementationOnce(() => {
      throw new Error('The installer could not be started.');
    });
    const updater = new AppUpdater({
      mainWindow: mainWindow as never,
      currentVersion: '0.2.1',
      isPackaged: true,
      loadAutoUpdater: async () => ({ autoUpdater: fakeAutoUpdater }),
    });
    await updater.checkForUpdates();

    await expect(updater.quitAndInstall()).rejects.toThrow('The installer could not be started.');

    expect(app.releaseSingleInstanceLock).toHaveBeenCalledOnce();
    expect(app.requestSingleInstanceLock).toHaveBeenCalledOnce();
    expect(app.releaseSingleInstanceLock.mock.invocationCallOrder[0]).toBeLessThan(
      app.requestSingleInstanceLock.mock.invocationCallOrder[0]!,
    );
  });

  it('takes the lock back when the installer reports a failure after the install request returned', async () => {
    const { mainWindow } = createMainWindowMock();
    const fakeAutoUpdater = new FakeAutoUpdater();
    fakeAutoUpdater.checkForUpdates.mockImplementationOnce(async () => {
      fakeAutoUpdater.emit('update-downloaded', { version: '0.2.2' });
    });
    const updater = new AppUpdater({
      mainWindow: mainWindow as never,
      currentVersion: '0.2.1',
      isPackaged: true,
      loadAutoUpdater: async () => ({ autoUpdater: fakeAutoUpdater }),
    });
    await updater.checkForUpdates();

    await updater.quitAndInstall();
    expect(app.releaseSingleInstanceLock).toHaveBeenCalledOnce();
    expect(app.requestSingleInstanceLock).not.toHaveBeenCalled();

    fakeAutoUpdater.emit('error', new Error('The installer exited with code 1.'));
    fakeAutoUpdater.emit('error', new Error('A later, unrelated update error.'));

    expect(updater.getState().status).toBe('error');
    expect(app.requestSingleInstanceLock).toHaveBeenCalledOnce();
  });

  it('does not touch the lock for an update error outside an installation', async () => {
    const { mainWindow } = createMainWindowMock();
    const fakeAutoUpdater = new FakeAutoUpdater();
    const updater = new AppUpdater({
      mainWindow: mainWindow as never,
      currentVersion: '0.2.1',
      isPackaged: true,
      loadAutoUpdater: async () => ({ autoUpdater: fakeAutoUpdater }),
    });
    await updater.checkForUpdates();

    fakeAutoUpdater.emit('error', new Error('The update server is unreachable.'));

    expect(app.releaseSingleInstanceLock).not.toHaveBeenCalled();
    expect(app.requestSingleInstanceLock).not.toHaveBeenCalled();
  });

  it('installs AppImage updates with the shared explicit-restart installer, as Director and Vista do', async () => {
    const platform = vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
    try {
      const { mainWindow } = createMainWindowMock();
      const updater = new AppUpdater({ mainWindow: mainWindow as never, currentVersion: '0.2.1', isPackaged: true });

      await updater.checkForUpdates();

      const [moduleUpdater, installer, ...others] = electronUpdater.instances as Array<
        InstanceType<typeof electronUpdater.AppImageUpdater>
      >;
      expect(others).toEqual([]);
      expect(moduleUpdater).toBe(electronUpdater.autoUpdater);
      expect(moduleUpdater!.checkForUpdates).not.toHaveBeenCalled();
      expect(installer!.constructor.name).toBe('SafeAppImageUpdater');
      expect(installer!.autoInstallOnAppQuit).toBe(false);
      expect(installer!.checkForUpdates).toHaveBeenCalledOnce();
    } finally {
      platform.mockRestore();
    }
  });

  it('waits for the native before-quit-for-update event before bypassing close confirmation', async () => {
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

    expect(onBeforeQuitForInstall).not.toHaveBeenCalled();
    expect(fakeAutoUpdater.quitAndInstall).toHaveBeenCalledWith(false, true);

    nativeAutoUpdater.emit('before-quit-for-update');

    expect(onBeforeQuitForInstall).toHaveBeenCalledTimes(1);
  });

  it('clears stale download progress when an update attempt fails', async () => {
    const { mainWindow } = createMainWindowMock();
    const fakeAutoUpdater = new FakeAutoUpdater();
    fakeAutoUpdater.checkForUpdates.mockImplementationOnce(async () => {
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
      fakeAutoUpdater.emit('error', new Error('download failed'));
    });

    const updater = new AppUpdater({
      mainWindow: mainWindow as never,
      currentVersion: '0.2.1',
      isPackaged: true,
      loadAutoUpdater: async () => ({ autoUpdater: fakeAutoUpdater }),
    });

    const state = await updater.checkForUpdates();

    expect(state.status).toBe('error');
    expect(state.errorMessage).toBe('download failed');
    expect(state.downloadPercent).toBeNull();
    expect(state.transferredBytes).toBeNull();
    expect(state.totalBytes).toBeNull();
    expect(state.bytesPerSecond).toBeNull();
    expect(state.canInstallUpdate).toBe(false);
  });

  it('retries updater initialization after an initial setup failure', async () => {
    const { mainWindow } = createMainWindowMock();
    const fakeAutoUpdater = new FakeAutoUpdater();
    fakeAutoUpdater.checkForUpdates.mockImplementationOnce(async () => {
      fakeAutoUpdater.emit('update-available', {
        version: '0.2.2',
        releaseName: 'Saika Lane 0.2.2',
        releaseDate: '2026-04-23T00:00:00.000Z',
        releaseNotes: 'Bug fixes',
      });
    });

    const loadAutoUpdater = vi
      .fn<() => Promise<{ autoUpdater: FakeAutoUpdater }>>()
      .mockRejectedValueOnce(new Error('init failed'))
      .mockResolvedValueOnce({ autoUpdater: fakeAutoUpdater });

    const updater = new AppUpdater({
      mainWindow: mainWindow as never,
      currentVersion: '0.2.1',
      isPackaged: true,
      loadAutoUpdater,
    });

    const failedState = await updater.checkForUpdates();

    expect(failedState.status).toBe('error');
    expect(failedState.errorMessage).toBe('init failed');
    expect(failedState.canCheckForUpdates).toBe(true);

    const recoveredState = await updater.checkForUpdates();

    expect(loadAutoUpdater).toHaveBeenCalledTimes(2);
    expect(fakeAutoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(recoveredState.status).toBe('available');
    expect(recoveredState.targetVersion).toBe('0.2.2');
  });

  it('keeps a downloaded update installable after a quitAndInstall failure', async () => {
    const { mainWindow } = createMainWindowMock();
    const fakeAutoUpdater = new FakeAutoUpdater();
    fakeAutoUpdater.checkForUpdates.mockImplementationOnce(async () => {
      fakeAutoUpdater.emit('update-downloaded', {
        version: '0.2.2',
      });
    });
    fakeAutoUpdater.quitAndInstall.mockImplementationOnce(() => {
      fakeAutoUpdater.emit('error', new Error('install failed'));
    });

    const updater = new AppUpdater({
      mainWindow: mainWindow as never,
      currentVersion: '0.2.1',
      isPackaged: true,
      loadAutoUpdater: async () => ({ autoUpdater: fakeAutoUpdater }),
    });

    await updater.checkForUpdates();
    await expect(updater.quitAndInstall()).rejects.toThrow('install failed');

    expect(updater.getState().status).toBe('error');
    expect(updater.getState().errorMessage).toBe('install failed');
    expect(updater.getState().canInstallUpdate).toBe(true);
    expect(updater.getState().canCheckForUpdates).toBe(false);

    await expect(updater.quitAndInstall()).resolves.toBeUndefined();
    expect(fakeAutoUpdater.quitAndInstall).toHaveBeenCalledTimes(2);
  });

  it('preserves install readiness when checkForUpdates is called again after download', async () => {
    const { mainWindow } = createMainWindowMock();
    const fakeAutoUpdater = new FakeAutoUpdater();
    fakeAutoUpdater.checkForUpdates
      .mockImplementationOnce(async () => {
        fakeAutoUpdater.emit('update-downloaded', {
          version: '0.2.2',
        });
      })
      .mockImplementationOnce(async () => {
        fakeAutoUpdater.emit('checking-for-update');
      });

    const updater = new AppUpdater({
      mainWindow: mainWindow as never,
      currentVersion: '0.2.1',
      isPackaged: true,
      loadAutoUpdater: async () => ({ autoUpdater: fakeAutoUpdater }),
    });

    await updater.checkForUpdates();
    expect(updater.getState().canInstallUpdate).toBe(true);

    await updater.checkForUpdates();

    expect(fakeAutoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(updater.getState().canInstallUpdate).toBe(true);
  });

  it('waits for an in-flight checkForUpdates call before returning the result to later callers', async () => {
    const { mainWindow } = createMainWindowMock();
    const fakeAutoUpdater = new FakeAutoUpdater();
    let finishCheck: (() => void) | null = null;
    fakeAutoUpdater.checkForUpdates.mockImplementationOnce(
      () =>
        new Promise<undefined>((resolve) => {
          finishCheck = () => {
            fakeAutoUpdater.emit('update-downloaded', {
              version: '0.2.2',
            });
            resolve(undefined);
          };
        }),
    );

    const updater = new AppUpdater({
      mainWindow: mainWindow as never,
      currentVersion: '0.2.1',
      isPackaged: true,
      loadAutoUpdater: async () => ({ autoUpdater: fakeAutoUpdater }),
    });

    const firstCheck = updater.checkForUpdates();
    await vi.waitFor(() => {
      expect(fakeAutoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
    });

    const secondCheck = updater.checkForUpdates();
    const completeCheck = finishCheck;
    if (!completeCheck) {
      throw new Error('Expected in-flight updater check to be pending.');
    }
    (completeCheck as () => void)();

    await expect(firstCheck).resolves.toMatchObject({ status: 'downloaded' });
    await expect(secondCheck).resolves.toMatchObject({ status: 'downloaded' });
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
