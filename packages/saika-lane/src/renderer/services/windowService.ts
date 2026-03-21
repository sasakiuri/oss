// SPDX-License-Identifier: MIT
/**
 * Window Service
 *
 * @description
 * Provides window operation methods (fullscreen toggle, minimize, maximize, close, etc.).
 * All methods use createServiceMethod factories for unified error handling.
 */

import { createVoidCommandMethod, createVoidServiceMethod } from './createServiceMethod';

export const windowService = {
  /**
   * Toggle fullscreen mode
   */
  toggleFullscreen: createVoidServiceMethod(() => window.electronAPI.window.toggleFullscreen()),

  /**
   * Minimize the window
   */
  minimize: createVoidCommandMethod(() => window.electronAPI.window.minimize()),

  /**
   * Maximize or restore the window
   *
   * @returns Promise resolving to window state with isMaximized
   */
  maximize: createVoidServiceMethod(() => window.electronAPI.window.maximize()),

  /**
   * Close the window
   */
  close: createVoidCommandMethod(() => window.electronAPI.window.close()),

  /**
   * Get the current window state
   *
   * @returns Promise resolving to window state with isMaximized
   */
  getWindowState: createVoidServiceMethod(() => window.electronAPI.window.getWindowState()),
};
