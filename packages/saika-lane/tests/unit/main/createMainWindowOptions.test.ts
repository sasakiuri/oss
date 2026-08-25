// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { createMainWindowOptions } from '@/main/createMainWindowOptions';

describe('createMainWindowOptions', () => {
  it('enables fullscreen for packaged builds', () => {
    const options = createMainWindowOptions({
      isPackaged: true,
      preloadPath: '/tmp/preload.mjs',
      useNativeWindowFrame: true,
    });

    expect(options.fullscreen).toBe(true);
    expect(options.frame).toBe(true);
    expect(options.webPreferences?.preload).toBe('/tmp/preload.mjs');
    expect(options.webPreferences?.nodeIntegration).toBe(false);
    expect(options.webPreferences?.contextIsolation).toBe(true);
    expect(options.webPreferences?.sandbox).toBe(true);
  });

  it('keeps development builds in windowed mode', () => {
    const options = createMainWindowOptions({
      isPackaged: false,
      preloadPath: '/tmp/preload.mjs',
      useNativeWindowFrame: false,
    });

    expect(options.fullscreen).toBe(false);
    expect(options.frame).toBe(false);
  });
});
