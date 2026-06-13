// SPDX-License-Identifier: MIT
import type { BrowserWindow } from 'electron';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const shared = vi.hoisted(() => ({
  appFocus: vi.fn(),
}));

vi.mock('electron', () => ({
  app: {
    focus: shared.appFocus,
  },
}));

const { focusStartupWindow } = await import('@/main/focusStartupWindow');

function createWindowMock(overrides: Partial<BrowserWindow> = {}): BrowserWindow {
  return {
    focus: vi.fn(),
    isDestroyed: vi.fn(() => false),
    isFocused: vi.fn(() => true),
    isMinimized: vi.fn(() => false),
    moveTop: vi.fn(),
    restore: vi.fn(),
    setAlwaysOnTop: vi.fn(),
    show: vi.fn(),
    ...overrides,
  } as unknown as BrowserWindow;
}

describe('focusStartupWindow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    shared.appFocus.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('focuses the main window immediately and retries during startup', () => {
    const mainWindow = createWindowMock();

    focusStartupWindow(mainWindow);

    expect(mainWindow.show).toHaveBeenCalledTimes(1);
    expect(shared.appFocus).toHaveBeenCalledTimes(1);
    expect(mainWindow.focus).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(250);
    expect(mainWindow.focus).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(750);
    expect(mainWindow.focus).toHaveBeenCalledTimes(3);

    vi.advanceTimersByTime(1500);
    expect(mainWindow.focus).toHaveBeenCalledTimes(4);
  });

  it('restores a minimized window before focusing it', () => {
    const mainWindow = createWindowMock({
      isMinimized: vi.fn(() => true),
    });

    focusStartupWindow(mainWindow);

    expect(mainWindow.restore).toHaveBeenCalledTimes(1);
    expect(mainWindow.show).toHaveBeenCalledTimes(1);
    expect(mainWindow.focus).toHaveBeenCalledTimes(1);
  });

  it('does not focus a destroyed window', () => {
    const mainWindow = createWindowMock({
      isDestroyed: vi.fn(() => true),
    });

    focusStartupWindow(mainWindow);
    vi.runAllTimers();

    expect(mainWindow.show).not.toHaveBeenCalled();
    expect(shared.appFocus).not.toHaveBeenCalled();
    expect(mainWindow.focus).not.toHaveBeenCalled();
  });
});
