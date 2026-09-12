// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (event: { preventDefault: () => void }) => void>(),
  windowHandlers: new Map<string, (event: { preventDefault: () => void }) => void>(),
  beforeInstall: null as null | (() => Promise<void>),
  onInstallError: null as null | ((message: string) => void),
  stopAll: vi.fn(),
  checkForUpdates: vi.fn(),
  quit: vi.fn(),
  releaseLock: vi.fn(),
  flush: vi.fn(),
  confirm: vi.fn(),
  relaunch: vi.fn(),
  showErrorBox: vi.fn(),
}));
vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: () => '/tmp/director-update-test',
    requestSingleInstanceLock: () => true,
    whenReady: () => Promise.resolve(),
    on: (name: string, handler: (event: { preventDefault: () => void }) => void) => mocks.handlers.set(name, handler),
    quit: mocks.quit,
    releaseSingleInstanceLock: mocks.releaseLock,
    relaunch: mocks.relaunch,
  },
  BrowserWindow: class {
    on = (name: string, handler: (event: { preventDefault: () => void }) => void) =>
      mocks.windowHandlers.set(name, handler);
    loadFile = () => Promise.resolve();
    isDestroyed = () => false;
  },
  dialog: { showMessageBoxSync: mocks.confirm, showErrorBox: mocks.showErrorBox },
}));
vi.mock('@/shared/utils/Logger', () => ({
  Logger: {
    configure: vi.fn(),
    flush: mocks.flush,
    create: () => ({ info: vi.fn(), error: vi.fn(), logError: vi.fn() }),
  },
}));
vi.mock('@/shared/logging/FileTransport', () => ({ FileTransport: class {} }));
vi.mock('@/main/infrastructure/window/hardenBrowserWindow', () => ({ hardenBrowserWindow: vi.fn() }));
vi.mock('@/main/infrastructure/window/resolveDevServerUrl', () => ({ resolveDevServerUrl: () => null }));
vi.mock('@/main/modules/operational-archives', () => ({ applyPendingDatabaseRestoreSync: () => ({ applied: false }) }));
vi.mock('@/main/composition/createContainer', () => ({
  createApp: (
    _preload: string,
    updateLifecycle: { beforeInstall: () => Promise<void>; onInstallError: (message: string) => void },
  ) => {
    mocks.beforeInstall = updateLifecycle.beforeInstall;
    mocks.onInstallError = updateLifecycle.onInstallError;
    return {
      windowManager: { registerMainWindow: vi.fn() },
      lifecycle: { startAll: async () => {}, stopAll: mocks.stopAll },
      updater: { checkForUpdates: mocks.checkForUpdates },
    };
  },
}));

describe('Director update shutdown', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.handlers.clear();
    mocks.windowHandlers.clear();
    mocks.stopAll.mockResolvedValue(undefined);
    mocks.checkForUpdates.mockResolvedValue(undefined);
    vi.spyOn(process, 'on').mockReturnValue(process);
    await import('@/main/main');
    await vi.waitFor(() => expect(mocks.windowHandlers.has('close')).toBe(true));
  });
  afterEach(() => vi.restoreAllMocks());

  it('checks at startup without quitting', () => {
    expect(mocks.checkForUpdates).toHaveBeenCalledOnce();
    expect(mocks.quit).not.toHaveBeenCalled();
  });

  it('waits for lifecycle cleanup before allowing the native installer to quit', async () => {
    let finishStop!: () => void;
    mocks.stopAll.mockReturnValue(
      new Promise<void>((resolve) => {
        finishStop = resolve;
      }),
    );
    const preparing = mocks.beforeInstall!();
    expect(mocks.stopAll).toHaveBeenCalledOnce();
    expect(mocks.flush).not.toHaveBeenCalled();
    expect(mocks.quit).not.toHaveBeenCalled();
    expect(mocks.releaseLock).not.toHaveBeenCalled();
    finishStop();
    await preparing;
    expect(mocks.releaseLock).toHaveBeenCalledOnce();
    expect(mocks.flush).toHaveBeenCalledOnce();
    const event = { preventDefault: vi.fn() };
    mocks.handlers.get('before-quit')!(event);
    mocks.windowHandlers.get('close')!(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(mocks.quit).not.toHaveBeenCalled();
  });

  it('preserves normal application shutdown after lifecycle cleanup', async () => {
    const event = { preventDefault: vi.fn() };
    mocks.handlers.get('before-quit')!(event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(mocks.quit).toHaveBeenCalledOnce());
    expect(mocks.stopAll).toHaveBeenCalledOnce();
    expect(mocks.flush).toHaveBeenCalledOnce();
  });

  it('does not turn an install into a normal quit if another quit arrives during cleanup', async () => {
    let finishStop!: () => void;
    mocks.stopAll.mockReturnValue(
      new Promise<void>((resolve) => {
        finishStop = resolve;
      }),
    );
    const preparing = mocks.beforeInstall!();
    const event = { preventDefault: vi.fn() };
    mocks.handlers.get('before-quit')!(event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(mocks.releaseLock).not.toHaveBeenCalled();
    finishStop();
    await preparing;
    expect(mocks.releaseLock).toHaveBeenCalledOnce();
    await Promise.resolve();
    expect(mocks.quit).not.toHaveBeenCalled();
    expect(mocks.stopAll).toHaveBeenCalledOnce();
  });

  it('restarts the current app once if a later native error arrives after cleanup', async () => {
    await mocks.beforeInstall!();
    mocks.onInstallError!('The native installer failed');
    mocks.onInstallError!('Repeated native error');
    await vi.waitFor(() => expect(mocks.relaunch).toHaveBeenCalledOnce());
    expect(mocks.showErrorBox).toHaveBeenCalledWith(
      'Update installation failed',
      expect.stringContaining('The native installer failed'),
    );
    expect(mocks.quit).toHaveBeenCalledOnce();
    expect(mocks.stopAll).toHaveBeenCalledOnce();
  });

  it('reports failed cleanup and allows recovery to quit', async () => {
    mocks.stopAll.mockRejectedValue(new Error('Cleanup failed'));
    await expect(mocks.beforeInstall!()).rejects.toThrow('Cleanup failed');
    expect(mocks.releaseLock).not.toHaveBeenCalled();
    mocks.onInstallError!('Cleanup failed');
    await vi.waitFor(() => expect(mocks.relaunch).toHaveBeenCalledOnce());
    const event = { preventDefault: vi.fn() };
    mocks.handlers.get('before-quit')!(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(mocks.quit).toHaveBeenCalledOnce();
  });

  it('does not restart for a download or check error before install confirmation', async () => {
    mocks.onInstallError!('The update server is unavailable');
    await Promise.resolve();
    expect(mocks.relaunch).not.toHaveBeenCalled();
    expect(mocks.quit).not.toHaveBeenCalled();
    expect(mocks.stopAll).not.toHaveBeenCalled();
    expect(mocks.showErrorBox).not.toHaveBeenCalled();
  });
});
