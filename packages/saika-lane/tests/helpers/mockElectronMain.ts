// SPDX-License-Identifier: MIT
import { vi, type Mock } from 'vitest';

type CloseHandler = (event: { preventDefault: () => void }) => void;

/** Callbacks the main entry point registers on the mocked window, captured for the test to fire. */
export interface ElectronMainMock {
  userDataPath: string;
  didFinishLoad: (() => void) | null;
  closeHandler: CloseHandler | null;
  showMessageBox: Mock;
}

export function createElectronMainMock(userDataPath: string): ElectronMainMock {
  return {
    userDataPath,
    didFinishLoad: null,
    closeHandler: null,
    showMessageBox: vi.fn().mockResolvedValue({ response: 1 }),
  };
}

/** Replaces `electron` for the next import of the main entry point (call after `vi.resetModules()`). */
export function mockElectronMain(electron: ElectronMainMock): void {
  vi.doMock('electron', () => {
    class BrowserWindow {
      webContents = {
        on: vi.fn(),
        once: vi.fn((event: string, callback: () => void) => {
          if (event === 'did-finish-load') {
            electron.didFinishLoad = callback;
          }
        }),
        setWindowOpenHandler: vi.fn(),
        openDevTools: vi.fn(),
        send: vi.fn(),
      };

      loadURL = vi.fn();
      loadFile = vi.fn();
      on = vi.fn((event: string, callback: CloseHandler) => {
        if (event === 'close') {
          electron.closeHandler = callback;
        }
      });
      once = vi.fn();
      close = vi.fn();
      destroy = vi.fn();
      minimize = vi.fn();
      maximize = vi.fn();
      unmaximize = vi.fn();
      isMaximized = vi.fn(() => false);
      setFullScreen = vi.fn();
      isFullScreen = vi.fn(() => false);
      isDestroyed = vi.fn(() => false);
      isMinimized = vi.fn(() => false);
      restore = vi.fn();
      show = vi.fn();
      focus = vi.fn();
      isFocused = vi.fn(() => true);
      moveTop = vi.fn();
      setAlwaysOnTop = vi.fn();
    }

    return {
      app: {
        isPackaged: false,
        commandLine: {
          appendSwitch: vi.fn(),
        },
        whenReady: vi.fn(() => Promise.resolve()),
        on: vi.fn(),
        getPath: vi.fn(() => electron.userDataPath),
        quit: vi.fn(),
        focus: vi.fn(),
      },
      BrowserWindow,
      // AppUpdater registers its install-restart listener when the main window is bound.
      autoUpdater: { on: vi.fn() },
      dialog: {
        showMessageBox: electron.showMessageBox,
      },
      Menu: {
        setApplicationMenu: vi.fn(),
      },
    };
  });
}
