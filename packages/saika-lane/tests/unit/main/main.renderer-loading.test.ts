// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  app: {
    isPackaged: false,
    commandLine: { appendSwitch: vi.fn() },
    whenReady: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    getPath: vi.fn(() => '/tmp/saika-lane-user-data'),
    quit: vi.fn(),
  },
  window: {
    webContents: {
      on: vi.fn(),
      setWindowOpenHandler: vi.fn(),
      openDevTools: vi.fn(),
    },
    loadURL: vi.fn(),
    loadFile: vi.fn(),
  },
  createLaneApp: vi.fn(),
}));

vi.mock('electron', () => ({
  app: state.app,
  BrowserWindow: vi.fn(function () {
    return state.window;
  }),
}));
vi.mock('@/main/shared-infra/compat/setupCjsCompat', () => ({}));
vi.mock('@/main/shared-infra/logging', () => ({ getLogger: () => ({ debug: vi.fn() }) }));
vi.mock('@/main/composition/createLaneApp', () => ({ createLaneApp: state.createLaneApp }));

beforeEach(() => {
  vi.resetModules();
  state.app.isPackaged = false;
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
