// SPDX-License-Identifier: MIT
import { createServiceMethod } from './createServiceMethod';

export const windowService = {
  toggleFullscreen: createServiceMethod((api) => api.window.toggleFullscreen),
  minimize: createServiceMethod((api) => api.window.minimize),
  /** Maximize or restore the window; resolves to the new window state. */
  maximize: createServiceMethod((api) => api.window.maximize),
  close: createServiceMethod((api) => api.window.close),
  getWindowState: createServiceMethod((api) => api.window.getWindowState),
};
