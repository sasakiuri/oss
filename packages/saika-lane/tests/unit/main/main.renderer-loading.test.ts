// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  app: {
    isPackaged: false,
    commandLine: { appendSwitch: vi.fn() },
    whenReady: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    getPath: vi.fn(() => '/tmp/saika-lane-user-data'),
    requestSingleInstanceLock: vi.fn(() => true),
    quit: vi.fn(),
  },
  window: {
    webContents: {
      on: vi.fn(),
      setWindowOpenHandler: vi.fn(),
      getURL: vi.fn(() => ''),
      session: { setPermissionRequestHandler: vi.fn(), setPermissionCheckHandler: vi.fn() },
      openDevTools: vi.fn(),
    },
    loadURL: vi.fn(),
    loadFile: vi.fn(),
  },
  createLaneApp: vi.fn(),
  logger: { debug: vi.fn(), error: vi.fn() },
}));

vi.mock('electron', () => ({
  app: state.app,
  BrowserWindow: vi.fn(function () {
    return state.window;
  }),
}));
vi.mock('@/main/startup/restoreActiveRun', () => ({
  ActiveRunStartup: class {
    callbacks: Array<() => Promise<void>> = [];
    afterReady = (callback: () => Promise<void>) => this.callbacks.push(callback);
    snapshot = async () => ({ status: 'READY' });
    restore = vi.fn(async () => {
      for (const callback of this.callbacks) void callback();
      return { status: 'READY' };
    });
  },
}));

vi.mock('@/main/shared-infra/compat/setupCjsCompat', () => ({}));
vi.mock('@/main/shared-infra/logging', () => ({ getLogger: () => state.logger }));
vi.mock('@/main/composition/createLaneApp', () => ({ createLaneApp: state.createLaneApp }));

beforeEach(() => {
  vi.resetModules();
  state.window.webContents.on.mockClear();
  state.logger.debug.mockClear();
  state.logger.error.mockClear();
  state.app.isPackaged = false;
  state.window.webContents.getURL.mockReturnValue('');
  vi.stubEnv('VITE_DEV_SERVER_URL', undefined);
  vi.stubEnv('OPEN_DEVTOOLS', undefined);
  vi.stubEnv('SAIKA_LANE_NATIVE_WINDOW_FRAME', process.env.SAIKA_LANE_NATIVE_WINDOW_FRAME);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

async function startApplication() {
  await import('@/main/main');
  await vi.waitFor(() => expect(state.createLaneApp).toHaveBeenCalledOnce());
}

describe('main window renderer loading', () => {
  it.each(['http://localhost:5173', 'https://example.test'])(
    'loads the bundled screen in a packaged app even when the development URL is %s',
    async (url) => {
      state.app.isPackaged = true;
      vi.stubEnv('VITE_DEV_SERVER_URL', url);

      await startApplication();

      expect(state.window.loadFile).toHaveBeenCalledWith(expect.stringMatching(/[\\/]renderer[\\/]index\.html$/));
      expect(state.window.loadURL).not.toHaveBeenCalled();
      expect(state.window.webContents.openDevTools).not.toHaveBeenCalled();
    },
  );

  it('loads the development server in an unpackaged app', async () => {
    vi.stubEnv('VITE_DEV_SERVER_URL', 'http://localhost:5173');

    await startApplication();

    expect(state.window.loadURL).toHaveBeenCalledWith('http://localhost:5173');
    expect(state.window.loadFile).not.toHaveBeenCalled();
    expect(state.window.webContents.openDevTools).toHaveBeenCalledWith({ mode: 'detach' });
  });

  it('loads the bundled screen when no development server is configured', async () => {
    await startApplication();

    expect(state.window.loadFile).toHaveBeenCalledWith(expect.stringMatching(/[\\/]renderer[\\/]index\.html$/));
    expect(state.window.loadURL).not.toHaveBeenCalled();
    expect(state.window.webContents.openDevTools).not.toHaveBeenCalled();
  });
});

describe('main window protection', () => {
  const pageUrl = 'file:///opt/saika-lane/dist/renderer/index.html';

  function navigate(url: string): boolean {
    const handler = state.window.webContents.on.mock.calls.find(([event]) => event === 'will-navigate')?.[1] as (
      details: { url: string; preventDefault: () => void },
      url: string,
    ) => void;
    const details = { url, preventDefault: vi.fn() };
    handler(details, url);
    return details.preventDefault.mock.calls.length > 0;
  }

  it.each(['file:///etc/passwd', 'file:///opt/saika-lane/dist/renderer/print.html', 'https://example.test/'])(
    'keeps the main window from navigating to %s',
    async (url) => {
      state.window.webContents.getURL.mockReturnValue(pageUrl);
      await startApplication();

      expect(navigate(url)).toBe(true);
    },
  );

  it('lets the development server reload the page it serves', async () => {
    vi.stubEnv('VITE_DEV_SERVER_URL', 'http://localhost:5173');
    state.window.webContents.getURL.mockReturnValue('http://localhost:5173/');
    await startApplication();

    expect(navigate('http://localhost:5173/')).toBe(false);
    expect(navigate('http://localhost:5173/print.html')).toBe(true);
  });

  it('blocks webviews and denies permission requests in the main window', async () => {
    await startApplication();

    expect(state.window.webContents.on).toHaveBeenCalledWith('will-attach-webview', expect.any(Function));
    expect(state.window.webContents.session.setPermissionRequestHandler).toHaveBeenCalledOnce();
    expect(state.window.webContents.session.setPermissionCheckHandler).toHaveBeenCalledOnce();
  });
});

describe('renderer console forwarding', () => {
  function emitConsoleMessage(level: number, message: string): void {
    const handler = state.window.webContents.on.mock.calls.find(([event]) => event === 'console-message')?.[1] as (
      event: unknown,
      level: number,
      message: string,
      line: number,
      sourceId: string,
    ) => void;
    handler({}, level, message, 12, 'preload.mjs');
  }

  it('records a renderer error at error level so it reaches the log file by default', async () => {
    await startApplication();

    emitConsoleMessage(3, '[IPC] Ignored invalid event payload for "timer:tick"');

    expect(state.logger.error).toHaveBeenCalledWith(
      '[renderer:3] [IPC] Ignored invalid event payload for "timer:tick" (preload.mjs:12)',
      'renderer',
    );
    expect(state.logger.debug).not.toHaveBeenCalled();
  });

  it.each([0, 1, 2])('records a renderer console message of level %i at debug level', async (level) => {
    await startApplication();

    emitConsoleMessage(level, 'hello');

    expect(state.logger.debug).toHaveBeenCalledWith(`[renderer:${level}] hello (preload.mjs:12)`, 'renderer');
    expect(state.logger.error).not.toHaveBeenCalled();
  });
});
