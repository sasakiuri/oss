// SPDX-License-Identifier: MIT
import { BrowserWindow, type BrowserWindowConstructorOptions } from 'electron';

import { protectWindow } from '@/main/shared-infra/window/protectWindow';

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

/** Creates the main window and keeps it on the page main loads into it. */
export function createMainWindow(params: CreateMainWindowOptionsParams): BrowserWindow {
  const window = new BrowserWindow(createMainWindowOptions(params));
  protectWindow(window);
  return window;
}
