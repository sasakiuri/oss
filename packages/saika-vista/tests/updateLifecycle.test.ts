// SPDX-License-Identifier: MIT
import type { UpdaterServiceOptions } from '@sasakiuri/saika-updater/main';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { updateState } from './updateFixtures';

const mocks = vi.hoisted(() => ({
  options: null as UpdaterServiceOptions | null,
  handlers: new Map<string, (event: { preventDefault: () => void }) => void>(),
  ipc: new Map<string, (event: unknown) => unknown>(),
  contents: {
    mainFrame: {},
    send: vi.fn(),
    setWindowOpenHandler: vi.fn(),
    on: vi.fn(),
    session: { setPermissionRequestHandler: vi.fn(), setPermissionCheckHandler: vi.fn() },
  },
  stop: vi.fn(),
  load: vi.fn(),
  rejectLoad: null as ((error: Error) => void) | null,
  destroyed: false,
  check: vi.fn(),
  confirm: vi.fn(),
  error: vi.fn(),
  quit: vi.fn(),
  releaseLock: vi.fn(),
  relaunch: vi.fn(),
}));
vi.mock('@sasakiuri/saika-updater/main', () => ({
  UpdaterService: class {
    constructor(options: UpdaterServiceOptions) {
      mocks.options = options;
    }
    checkForUpdates = mocks.check;
    getState = () => updateState;
    quitAndInstall = vi.fn();
  },
}));
vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getVersion: () => '0.3.0',
    getPath: () => '/tmp/vista-updater-test',
    commandLine: { getSwitchValue: () => '' },
    requestSingleInstanceLock: () => true,
    whenReady: () => Promise.resolve(),
    quit: mocks.quit,
    releaseSingleInstanceLock: mocks.releaseLock,
    relaunch: mocks.relaunch,
    on: (name: string, handler: (event: { preventDefault: () => void }) => void) => mocks.handlers.set(name, handler),
  },
  BrowserWindow: class {
    webContents = mocks.contents;
    on = vi.fn();
    loadFile = mocks.load;
    isDestroyed = () => mocks.destroyed;
  },
  dialog: { showMessageBox: mocks.confirm, showErrorBox: mocks.error },
  nativeTheme: {},
  ipcMain: { handle: (name: string, handler: (event: unknown) => unknown) => mocks.ipc.set(name, handler) },
  screen: { on: vi.fn(), getPrimaryDisplay: () => ({ id: 1 }) },
  powerMonitor: { on: vi.fn() },
  powerSaveBlocker: {},
}));
vi.mock('../src/main/loginStart', () => ({ setLoginStart: vi.fn() }));
vi.mock('../src/main/VistaApplication', () => ({
  VistaApplication: {
    start: async () => ({ state: { document: { screens: [] } }, stop: mocks.stop }),
  },
}));

describe('Vista update shutdown', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.handlers.clear();
    mocks.ipc.clear();
    mocks.destroyed = false;
    mocks.load.mockImplementation(
      () =>
        new Promise<void>((_resolve, reject) => {
          mocks.rejectLoad = reject;
        }),
    );
    mocks.stop.mockResolvedValue(undefined);
    mocks.check.mockResolvedValue(updateState);
    mocks.confirm.mockResolvedValue({ response: 0 });
    await import('../src/main/main');
    await vi.waitFor(() => expect(mocks.handlers.has('activate')).toBe(true));
  });
  it('checks at startup and keeps normal quit from installing', async () => {
    expect(mocks.options?.metadataNamespace).toBe('vista');
    expect(mocks.options?.autoInstallOnAppQuit).toBe(false);
    expect(mocks.check).toHaveBeenCalledOnce();
    const event = { preventDefault: vi.fn() };
    mocks.handlers.get('before-quit')!(event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(mocks.quit).toHaveBeenCalledOnce());
    expect(mocks.stop).toHaveBeenCalledOnce();
  });
  it('reports a genuine renderer load failure while the window is still open', async () => {
    mocks.rejectLoad!(new Error('Renderer file missing'));
    await vi.waitFor(() => expect(mocks.error).toHaveBeenCalledWith('Saika Vista', 'Renderer file missing'));
  });
  it('does not open an error dialog for a window load interrupted by quitting', async () => {
    mocks.handlers.get('before-quit')!({ preventDefault: vi.fn() });
    await vi.waitFor(() => expect(mocks.quit).toHaveBeenCalledOnce());
    mocks.rejectLoad!(new Error('ERR_ABORTED'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mocks.error).not.toHaveBeenCalled();
  });
  it('does not open an error dialog for a window that closed while loading', async () => {
    mocks.destroyed = true;
    mocks.rejectLoad!(new Error('ERR_ABORTED'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mocks.error).not.toHaveBeenCalled();
  });
  it('keeps the running application intact when installation is cancelled', async () => {
    mocks.confirm.mockResolvedValue({ response: 1 });
    await expect(mocks.options!.beforeInstall!()).rejects.toThrow('cancelled');
    expect(mocks.stop).not.toHaveBeenCalled();
    expect(mocks.relaunch).not.toHaveBeenCalled();
    expect(mocks.confirm.mock.calls[0]![1]).toMatchObject({ defaultId: 1, cancelId: 1 });
  });
  it('waits for shutdown and blocks concurrent quit and commands', async () => {
    let finish!: () => void;
    mocks.stop.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const pending = mocks.options!.beforeInstall!();
    await vi.waitFor(() => expect(mocks.stop).toHaveBeenCalledOnce());
    const event = { preventDefault: vi.fn() };
    mocks.handlers.get('before-quit')!(event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(() =>
      mocks.ipc.get('vista:updates-check')!({ sender: mocks.contents, senderFrame: mocks.contents.mainFrame }),
    ).toThrow('restarting');
    expect(mocks.quit).not.toHaveBeenCalled();
    expect(mocks.releaseLock).not.toHaveBeenCalled();
    finish();
    await pending;
    expect(mocks.releaseLock).toHaveBeenCalledOnce();
    event.preventDefault.mockClear();
    mocks.handlers.get('before-quit')!(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(mocks.quit).not.toHaveBeenCalled();
  });
  it('restarts the current version once after a late installer error', async () => {
    await mocks.options!.beforeInstall!();
    const failure = { ...updateState, status: 'error' as const, errorMessage: 'Installer failed' };
    mocks.options!.onStateChange!(failure);
    mocks.options!.onStateChange!(failure);
    await vi.waitFor(() => expect(mocks.relaunch).toHaveBeenCalledOnce());
    expect(mocks.quit).toHaveBeenCalledOnce();
    expect(mocks.error).toHaveBeenCalledWith(
      'Vista update could not be installed',
      expect.stringContaining('current version'),
    );
  });
  it('recovers after cleanup fails, but never restarts on a download error', async () => {
    const failure = { ...updateState, status: 'error' as const, errorMessage: 'Storage failed' };
    mocks.options!.onStateChange!(failure);
    expect(mocks.relaunch).not.toHaveBeenCalled();
    mocks.stop.mockRejectedValue(new Error('Storage failed'));
    await expect(mocks.options!.beforeInstall!()).rejects.toThrow('Storage failed');
    mocks.options!.onStateChange!(failure);
    await vi.waitFor(() => expect(mocks.relaunch).toHaveBeenCalledOnce());
  });
  it('rejects audience and child-frame update requests', () => {
    for (const name of ['vista:updates-state', 'vista:updates-check', 'vista:updates-install']) {
      expect(() => mocks.ipc.get(name)!({ sender: { mainFrame: {} }, senderFrame: {} })).toThrow('operator window');
      expect(() => mocks.ipc.get(name)!({ sender: mocks.contents, senderFrame: {} })).toThrow('operator window');
    }
  });
});
