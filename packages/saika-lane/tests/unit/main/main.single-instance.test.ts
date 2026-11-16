// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  app: {
    isPackaged: true,
    commandLine: { appendSwitch: vi.fn() },
    whenReady: vi.fn(),
    on: vi.fn(),
    getPath: vi.fn(() => '/saika-lane-user-data'),
    requestSingleInstanceLock: vi.fn(),
    quit: vi.fn(),
    focus: vi.fn(),
  },
  window: {
    webContents: { on: vi.fn(), setWindowOpenHandler: vi.fn(), openDevTools: vi.fn() },
    loadURL: vi.fn(),
    loadFile: vi.fn(),
    isDestroyed: vi.fn(() => false),
    isMinimized: vi.fn(() => false),
    isFocused: vi.fn(() => true),
    restore: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
  },
  BrowserWindow: vi.fn(),
  createLaneApp: vi.fn(),
}));

vi.mock('electron', () => ({ app: state.app, BrowserWindow: state.BrowserWindow }));
vi.mock('@/main/shared-infra/compat/setupCjsCompat', () => ({}));
vi.mock('@/main/shared-infra/logging', () => ({ getLogger: () => ({ debug: vi.fn() }) }));
vi.mock('@/main/composition/createLaneApp', () => ({ createLaneApp: state.createLaneApp }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  state.app.whenReady.mockResolvedValue(undefined);
  state.BrowserWindow.mockImplementation(function () {
    return state.window;
  });
});

function appHandler(event: string): (() => void) | undefined {
  return state.app.on.mock.calls.find(([name]) => name === event)?.[1] as (() => void) | undefined;
}

describe('main single-instance lock', () => {
  it('quits a second launch without opening a window or starting Lane', async () => {
    state.app.requestSingleInstanceLock.mockReturnValue(false);

    await import('@/main/main');
    await Promise.resolve();

    expect(state.app.quit).toHaveBeenCalledOnce();
    expect(state.app.whenReady).not.toHaveBeenCalled();
    expect(state.BrowserWindow).not.toHaveBeenCalled();
    expect(state.createLaneApp).not.toHaveBeenCalled();
    expect(appHandler('second-instance')).toBeUndefined();
  });

  it('restores and focuses the running window when Lane is launched again', async () => {
    state.app.requestSingleInstanceLock.mockReturnValue(true);
    await import('@/main/main');
    await vi.waitFor(() => expect(state.createLaneApp).toHaveBeenCalledOnce());
    state.window.isMinimized.mockReturnValue(true);

    appHandler('second-instance')?.();

    expect(state.window.restore).toHaveBeenCalledOnce();
    expect(state.window.show).toHaveBeenCalledOnce();
    expect(state.window.focus).toHaveBeenCalled();
    expect(state.app.quit).not.toHaveBeenCalled();
    expect(state.BrowserWindow).toHaveBeenCalledOnce();
  });

  it('ignores a second launch that arrives before the window exists', async () => {
    state.app.requestSingleInstanceLock.mockReturnValue(true);
    state.app.whenReady.mockReturnValue(new Promise(() => undefined));
    await import('@/main/main');

    expect(() => appHandler('second-instance')?.()).not.toThrow();
    expect(appHandler('second-instance')).toBeTypeOf('function');
    expect(state.window.focus).not.toHaveBeenCalled();
    expect(state.BrowserWindow).not.toHaveBeenCalled();
  });
});
