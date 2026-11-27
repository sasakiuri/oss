// SPDX-License-Identifier: MIT
import type { UpdaterServiceOptions } from '@sasakiuri/saika-updater/main';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DesktopPort } from '../src/main/DesktopPort';
import type { ScreenConfig } from '../src/shared/model';

import { screenConfig } from './fixtures';
import { updateState } from './updateFixtures';

type Handler = (...args: never[]) => unknown;
const mocks = vi.hoisted(() => {
  /** What the next renderer load of any window returns. */
  const load = { next: (): Promise<void> => Promise.resolve() };
  class FakeContents {
    mainFrame = {};
    crashed = false;
    handlers = new Map<string, Handler>();
    send = vi.fn();
    on = vi.fn((name: string, handler: Handler) => {
      this.handlers.set(name, handler);
    });
    setWindowOpenHandler = vi.fn();
    session = { setPermissionRequestHandler: vi.fn(), setPermissionCheckHandler: vi.fn() };
    getURL = () => 'file:///renderer/index.html';
    isCrashed = () => this.crashed;
  }
  class FakeWindow {
    static instances: FakeWindow[] = [];
    webContents = new FakeContents();
    handlers = new Map<string, Handler>();
    destroyed = false;
    constructor(readonly options: Record<string, unknown>) {
      FakeWindow.instances.push(this);
    }
    on = vi.fn((name: string, handler: Handler) => {
      this.handlers.set(name, handler);
      return this;
    });
    emit(name: string) {
      (this.handlers.get(name) as (() => void) | undefined)?.();
    }
    loadFile = vi.fn((..._args: unknown[]) => load.next());
    loadURL = vi.fn(async () => undefined);
    isDestroyed = () => this.destroyed;
    show = vi.fn();
    focus = vi.fn();
    showInactive = vi.fn();
    setBounds = vi.fn();
    setFullScreen = vi.fn();
    close = vi.fn(() => {
      this.destroyed = true;
      this.emit('closed');
    });
  }
  const display = (id: number, label: string, x: number) => ({
    id,
    label,
    bounds: { x, y: 0, width: 1920, height: 1080 },
    size: { width: 1920, height: 1080 },
  });
  return {
    FakeWindow,
    load,
    displays: [display(1, 'Main', 0), display(2, '', 1920)],
    app: new Map<string, Handler>(),
    ipc: new Map<string, (event: unknown, input?: unknown) => unknown>(),
    screen: new Map<string, Handler>(),
    power: new Map<string, Handler>(),
    powerStart: vi.fn((_type: string) => 7),
    powerStop: vi.fn(),
    error: vi.fn(),
    confirm: vi.fn(),
    quit: vi.fn(),
    releaseLock: vi.fn(),
    relaunch: vi.fn(),
    checkForUpdates: vi.fn(),
    updater: null as UpdaterServiceOptions | null,
    desktop: null as DesktopPort | null,
    onStart: null as ((desktop: DesktopPort) => void) | null,
    application: {
      state: {
        document: { screens: [] as ScreenConfig[], controller: null },
        audience: vi.fn((id: string) => ({ id })),
        getEntries: vi.fn(() => [] as Array<Record<string, unknown>>),
        updateEntry: vi.fn(async () => undefined),
      },
      view: vi.fn(() => ({ view: true })),
      command: vi.fn(async () => undefined),
      discover: vi.fn(async () => []),
      stop: vi.fn(async (): Promise<void> => undefined),
    },
  };
});
vi.mock('@sasakiuri/saika-updater/main', () => ({
  UpdaterService: class {
    constructor(options: UpdaterServiceOptions) {
      mocks.updater = options;
    }
    checkForUpdates = mocks.checkForUpdates;
    getState = () => updateState;
    quitAndInstall = vi.fn();
  },
}));
vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getVersion: () => '0.4.1',
    getPath: () => 'vista-user-data',
    setPath: vi.fn(),
    commandLine: { getSwitchValue: () => '' },
    requestSingleInstanceLock: () => true,
    whenReady: () => Promise.resolve(),
    quit: mocks.quit,
    releaseSingleInstanceLock: mocks.releaseLock,
    relaunch: mocks.relaunch,
    on: (name: string, handler: Handler) => mocks.app.set(name, handler),
  },
  BrowserWindow: mocks.FakeWindow,
  dialog: { showMessageBox: mocks.confirm, showErrorBox: mocks.error },
  nativeTheme: {},
  ipcMain: { handle: (name: string, handler: (event: unknown) => unknown) => mocks.ipc.set(name, handler) },
  screen: {
    getAllDisplays: () => mocks.displays,
    getPrimaryDisplay: () => mocks.displays[0],
    on: (name: string, handler: Handler) => mocks.screen.set(name, handler),
  },
  powerMonitor: { on: (name: string, handler: Handler) => mocks.power.set(name, handler) },
  powerSaveBlocker: { start: mocks.powerStart, stop: mocks.powerStop },
}));
vi.mock('../src/main/loginStart', () => ({ setLoginStart: vi.fn() }));
vi.mock('../src/main/VistaApplication', () => ({
  VistaApplication: {
    start: async (_directory: string, desktop: DesktopPort) => {
      mocks.desktop = desktop;
      mocks.onStart?.(desktop);
      return mocks.application;
    },
  },
}));

type Window = InstanceType<typeof mocks.FakeWindow>;
const sender = (window: Window, mainFrame = true) => ({
  sender: window.webContents,
  senderFrame: mainFrame ? window.webContents.mainFrame : {},
});
const desktop = () => mocks.desktop!;
const windows = () => mocks.FakeWindow.instances;
const operatorWindow = () => windows()[0]!;
const outputConfig = (id = 'screen-one', monitorId = '2', revision = 1): ScreenConfig => ({
  ...screenConfig(revision),
  id,
  monitorId,
});

async function launch() {
  vi.resetModules();
  await import('../src/main/main');
  await vi.waitFor(() => expect(mocks.app.has('activate')).toBe(true));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv('VITE_DEV_SERVER_URL', '');
  mocks.FakeWindow.instances = [];
  mocks.app.clear();
  mocks.ipc.clear();
  mocks.screen.clear();
  mocks.power.clear();
  mocks.desktop = null;
  mocks.onStart = null;
  mocks.load.next = () => Promise.resolve();
  mocks.checkForUpdates.mockResolvedValue(updateState);
  mocks.application.stop.mockResolvedValue(undefined);
  mocks.application.state.document.screens = [];
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('Vista main process', () => {
  it('registers the operator and audience channels before starting the application', async () => {
    await launch();
    expect([...mocks.ipc.keys()]).toEqual([
      'vista:state',
      'vista:command',
      'vista:discover',
      'vista:updates-state',
      'vista:updates-check',
      'vista:updates-install',
      'vista:audience',
      'vista:rendered',
    ]);
    expect(desktop().monitors()).toEqual([
      { id: '1', name: 'Main', width: 1920, height: 1080, primary: true },
      { id: '2', name: 'Monitor 2', width: 1920, height: 1080, primary: false },
    ]);
    expect(windows()).toHaveLength(1);
    expect(operatorWindow().options).toMatchObject({
      title: 'Saika Vista',
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
  });

  it('serves operator requests only to the operator main frame', async () => {
    await launch();
    const operator = operatorWindow();
    expect(mocks.ipc.get('vista:state')!(sender(operator))).toEqual({ view: true });
    await mocks.ipc.get('vista:command')!(sender(operator), { type: 'closeScreen', screenId: 'screen-one' });
    await mocks.ipc.get('vista:discover')!(sender(operator));
    expect(mocks.application.discover).toHaveBeenCalledOnce();
    expect(mocks.ipc.get('vista:updates-state')!(sender(operator))).toBe(updateState);
    expect(() => mocks.ipc.get('vista:state')!(sender(operator, false))).toThrow('local operator window');
    desktop().open(outputConfig());
    expect(() => mocks.ipc.get('vista:command')!(sender(windows()[1]!), {})).toThrow('local operator window');
    expect(mocks.application.command).toHaveBeenCalledExactlyOnceWith({ type: 'closeScreen', screenId: 'screen-one' });
  });

  it('opens a hardened full-screen audience window and blocks display sleep while any is open', async () => {
    await launch();
    const config = outputConfig();
    desktop().open(config);
    const output = windows()[1]!;
    expect(output.options).toMatchObject({
      ...mocks.displays[1]!.bounds,
      title: config.name,
      backgroundColor: '#10191d',
      frame: false,
      fullscreen: true,
      autoHideMenuBar: true,
      show: false,
      webPreferences: {
        preload: expect.stringMatching(/preload[\\/]preload\.mjs$/),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false,
      },
    });
    const openHandler = output.webContents.setWindowOpenHandler.mock.calls[0]![0] as () => unknown;
    expect(openHandler()).toEqual({ action: 'deny' });
    for (const name of ['will-navigate', 'will-attach-webview']) {
      const event = { url: 'https://example.test/', preventDefault: vi.fn() };
      (output.webContents.handlers.get(name) as (event: unknown) => void)(event);
      expect(event.preventDefault).toHaveBeenCalledOnce();
    }
    const permission = vi.fn();
    const requestHandler = output.webContents.session.setPermissionRequestHandler.mock.calls[0]![0] as (
      ...args: unknown[]
    ) => void;
    requestHandler(output.webContents, 'media', permission);
    expect(permission).toHaveBeenCalledWith(false);
    const checkHandler = output.webContents.session.setPermissionCheckHandler.mock.calls[0]![0] as () => boolean;
    expect(checkHandler()).toBe(false);
    expect(output.loadFile).toHaveBeenCalledWith(expect.stringMatching(/renderer[\\/]index\.html$/), {
      query: { screen: config.id },
    });
    expect(output.showInactive).not.toHaveBeenCalled();
    output.emit('ready-to-show');
    expect(output.showInactive).toHaveBeenCalledOnce();
    expect(mocks.powerStart).toHaveBeenCalledExactlyOnceWith('prevent-display-sleep');
    expect(desktop().status(config.id)).toEqual({ revision: null, alive: false });

    desktop().open(outputConfig('screen-two', '1'));
    expect(windows()).toHaveLength(3);
    expect(mocks.powerStart).toHaveBeenCalledOnce();
    operatorWindow().webContents.send.mockClear();
    desktop().close(config.id);
    expect(output.close).toHaveBeenCalledOnce();
    expect(operatorWindow().webContents.send).toHaveBeenCalledWith('vista:changed');
    expect(mocks.powerStop).not.toHaveBeenCalled();
    windows()[2]!.close();
    expect(mocks.powerStop).toHaveBeenCalledExactlyOnceWith(7);
    expect(() => desktop().close('missing-screen')).not.toThrow();
    desktop().open(config);
    expect(mocks.powerStart).toHaveBeenCalledTimes(2);
  });

  it('moves an open audience window to the selected monitor instead of opening another', async () => {
    await launch();
    desktop().open(outputConfig('screen-one', '2'));
    const output = windows()[1]!;
    desktop().open(outputConfig('screen-one', '1', 2));
    expect(windows()).toHaveLength(2);
    expect(output.setBounds).toHaveBeenCalledWith(mocks.displays[0]!.bounds);
    expect(output.setFullScreen).toHaveBeenCalledWith(true);
    expect(output.showInactive).toHaveBeenCalledOnce();
    expect(output.webContents.send).toHaveBeenCalledExactlyOnceWith('vista:changed');
    expect(output.loadFile).toHaveBeenCalledOnce();
    output.webContents.crashed = true;
    desktop().open(outputConfig('screen-one', '1', 3));
    expect(output.loadFile).toHaveBeenCalledTimes(2);
    expect(output.webContents.send).toHaveBeenCalledTimes(1);
  });

  it('rejects a screen whose monitor is disconnected', async () => {
    await launch();
    expect(() => desktop().open(outputConfig('screen-one', '9'))).toThrow(
      'The saved monitor is not connected. Select the replacement monitor explicitly.',
    );
    expect(windows()).toHaveLength(1);
    expect(mocks.powerStart).not.toHaveBeenCalled();
  });

  it('confirms rendering only from the audience window for its applied revision', async () => {
    await launch();
    const config = outputConfig('screen-one', '2', 2);
    mocks.application.state.document.screens = [config];
    desktop().open(config);
    const output = windows()[1]!;
    const rendered = mocks.ipc.get('vista:rendered')!;
    expect(() => rendered(sender(operatorWindow()), 2)).toThrow('audience window');
    expect(() => rendered(sender(output, false), 2)).toThrow('audience window');
    expect(() => rendered(sender(output), 0)).toThrow();
    rendered(sender(output), 1);
    expect(desktop().status(config.id)).toEqual({ revision: null, alive: false });
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    rendered(sender(output), 2);
    expect(desktop().status(config.id)).toEqual({ revision: 2, alive: true });
    vi.spyOn(Date, 'now').mockReturnValue(now + 3999);
    expect(desktop().status(config.id).alive).toBe(true);
    vi.spyOn(Date, 'now').mockReturnValue(now + 4000);
    expect(desktop().status(config.id)).toEqual({ revision: 2, alive: false });
    vi.spyOn(Date, 'now').mockReturnValue(now);
    (output.webContents.handlers.get('unresponsive') as () => void)();
    expect(desktop().status(config.id)).toEqual({ revision: 2, alive: false });
    rendered(sender(output), 2);
    (output.webContents.handlers.get('render-process-gone') as () => void)();
    expect(desktop().status(config.id)).toEqual({ revision: null, alive: false });

    expect(mocks.ipc.get('vista:audience')!(sender(output))).toEqual({ id: config.id });
    expect(mocks.application.state.audience).toHaveBeenCalledWith(config.id);
    expect(() => mocks.ipc.get('vista:audience')!(sender(operatorWindow()))).toThrow('audience window');
  });

  it('notifies the operator and every open audience window of changes', async () => {
    await launch();
    desktop().open(outputConfig('screen-one', '1'));
    desktop().open(outputConfig('screen-two', '2'));
    const [operator, first, second] = windows();
    second!.destroyed = true;
    desktop().changed();
    expect(operator!.webContents.send).toHaveBeenCalledWith('vista:changed');
    expect(first!.webContents.send).toHaveBeenCalledWith('vista:changed');
    expect(second!.webContents.send).not.toHaveBeenCalled();
  });

  it('closes the audience windows of a removed monitor', async () => {
    await launch();
    const removed = outputConfig('screen-one', '2');
    const kept = outputConfig('screen-two', '1');
    mocks.application.state.document.screens = [removed, kept];
    desktop().open(removed);
    desktop().open(kept);
    operatorWindow().webContents.send.mockClear();
    (mocks.screen.get('display-removed') as (event: unknown, display: { id: number }) => void)({}, { id: 2 });
    expect(windows()[1]!.close).toHaveBeenCalledOnce();
    expect(windows()[2]!.close).not.toHaveBeenCalled();
    expect(operatorWindow().webContents.send).toHaveBeenCalledWith('vista:changed');
    expect(desktop().status(removed.id)).toEqual({ revision: null, alive: false });
  });

  it('marks received data stale after the system resumes', async () => {
    await launch();
    const entry = { state: 'live', error: null };
    mocks.application.state.getEntries.mockReturnValue([entry]);
    (mocks.power.get('resume') as () => void)();
    expect(mocks.application.state.updateEntry).toHaveBeenCalledWith({
      state: 'stale',
      error: 'Resynchronizing after sleep',
    });
  });

  it('keeps the operator window closed when an audience window is restored on the primary monitor', async () => {
    mocks.onStart = (port) => port.open(outputConfig('screen-one', '1'));
    mocks.application.state.document.screens = [outputConfig('screen-one', '1')];
    await launch();
    expect(windows()).toHaveLength(1);
    expect(windows()[0]!.options).toMatchObject({ fullscreen: true });
  });
});

describe('Vista update shutdown', () => {
  let rejectLoad: (error: Error) => void;
  const beforeQuit = () => mocks.app.get('before-quit') as (event: { preventDefault: () => void }) => void;
  beforeEach(async () => {
    mocks.load.next = () =>
      new Promise<void>((_resolve, reject) => {
        rejectLoad = reject;
      });
    mocks.confirm.mockResolvedValue({ response: 0 });
    await launch();
  });
  it('checks at startup and keeps normal quit from installing', async () => {
    expect(mocks.updater?.metadataNamespace).toBe('vista');
    expect(mocks.updater?.autoInstallOnAppQuit).toBe(false);
    expect(mocks.checkForUpdates).toHaveBeenCalledOnce();
    const event = { preventDefault: vi.fn() };
    beforeQuit()(event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(mocks.quit).toHaveBeenCalledOnce());
    expect(mocks.application.stop).toHaveBeenCalledOnce();
  });
  it('reports a genuine renderer load failure while the window is still open', async () => {
    rejectLoad(new Error('Renderer file missing'));
    await vi.waitFor(() => expect(mocks.error).toHaveBeenCalledWith('Saika Vista', 'Renderer file missing'));
  });
  it('does not open an error dialog for a window load interrupted by quitting', async () => {
    beforeQuit()({ preventDefault: vi.fn() });
    await vi.waitFor(() => expect(mocks.quit).toHaveBeenCalledOnce());
    rejectLoad(new Error('ERR_ABORTED'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mocks.error).not.toHaveBeenCalled();
  });
  it('does not open an error dialog for a window that closed while loading', async () => {
    operatorWindow().destroyed = true;
    rejectLoad(new Error('ERR_ABORTED'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mocks.error).not.toHaveBeenCalled();
  });
  it('keeps the running application intact when installation is cancelled', async () => {
    mocks.confirm.mockResolvedValue({ response: 1 });
    await expect(mocks.updater!.beforeInstall!()).rejects.toThrow('cancelled');
    expect(mocks.application.stop).not.toHaveBeenCalled();
    expect(mocks.relaunch).not.toHaveBeenCalled();
    expect(mocks.confirm.mock.calls[0]![1]).toMatchObject({ defaultId: 1, cancelId: 1 });
  });
  it('waits for shutdown and blocks concurrent quit and commands', async () => {
    let finish!: () => void;
    mocks.application.stop.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const pending = mocks.updater!.beforeInstall!();
    await vi.waitFor(() => expect(mocks.application.stop).toHaveBeenCalledOnce());
    const event = { preventDefault: vi.fn() };
    beforeQuit()(event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(() => mocks.ipc.get('vista:updates-check')!(sender(operatorWindow()))).toThrow('restarting');
    expect(mocks.quit).not.toHaveBeenCalled();
    expect(mocks.releaseLock).not.toHaveBeenCalled();
    finish();
    await pending;
    expect(mocks.releaseLock).toHaveBeenCalledOnce();
    event.preventDefault.mockClear();
    beforeQuit()(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(mocks.quit).not.toHaveBeenCalled();
  });
  it('restarts the current version once after a late installer error', async () => {
    await mocks.updater!.beforeInstall!();
    const failure = { ...updateState, status: 'error' as const, errorMessage: 'Installer failed' };
    mocks.updater!.onStateChange!(failure);
    mocks.updater!.onStateChange!(failure);
    await vi.waitFor(() => expect(mocks.relaunch).toHaveBeenCalledOnce());
    expect(mocks.quit).toHaveBeenCalledOnce();
    expect(mocks.error).toHaveBeenCalledWith(
      'Vista update could not be installed',
      expect.stringContaining('current version'),
    );
  });
  it('recovers after cleanup fails, but never restarts on a download error', async () => {
    const failure = { ...updateState, status: 'error' as const, errorMessage: 'Storage failed' };
    mocks.updater!.onStateChange!(failure);
    expect(mocks.relaunch).not.toHaveBeenCalled();
    mocks.application.stop.mockRejectedValue(new Error('Storage failed'));
    await expect(mocks.updater!.beforeInstall!()).rejects.toThrow('Storage failed');
    mocks.updater!.onStateChange!(failure);
    await vi.waitFor(() => expect(mocks.relaunch).toHaveBeenCalledOnce());
  });
  it('rejects audience and child-frame update requests', () => {
    for (const name of ['vista:updates-state', 'vista:updates-check', 'vista:updates-install']) {
      expect(() => mocks.ipc.get(name)!({ sender: { mainFrame: {} }, senderFrame: {} })).toThrow('operator window');
      expect(() => mocks.ipc.get(name)!(sender(operatorWindow(), false))).toThrow('operator window');
    }
  });
});
