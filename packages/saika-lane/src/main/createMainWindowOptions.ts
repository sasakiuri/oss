// SPDX-License-Identifier: MIT
import type { BrowserWindowConstructorOptions } from 'electron';

export interface CreateMainWindowOptionsParams {
  isPackaged: boolean;
  preloadPath: string;
  useNativeWindowFrame?: boolean;
}

export function createMainWindowOptions({
  isPackaged,
  preloadPath,
  useNativeWindowFrame = false,
}: CreateMainWindowOptionsParams): BrowserWindowConstructorOptions {
  return {
    width: 1280,
    height: 800,
    frame: useNativeWindowFrame,
    fullscreen: isPackaged,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  };
}
