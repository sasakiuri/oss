// SPDX-License-Identifier: MIT
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  ipcRenderer: { invoke: vi.fn(), on: vi.fn(), removeListener: vi.fn() },
}));

import { buildPreloadAPI } from '@/preload/buildPreloadAPI';

// exposedApi.test.ts pins every exposed member; this covers what the preload environment decides.
describe('buildPreloadAPI', () => {
  const originalNativeWindowFrameEnv = process.env.SAIKA_LANE_NATIVE_WINDOW_FRAME;

  afterEach(() => {
    if (originalNativeWindowFrameEnv === undefined) {
      delete process.env.SAIKA_LANE_NATIVE_WINDOW_FRAME;
      return;
    }

    process.env.SAIKA_LANE_NATIVE_WINDOW_FRAME = originalNativeWindowFrameEnv;
  });

  it('reads native frame capability from the preload environment', () => {
    process.env.SAIKA_LANE_NATIVE_WINDOW_FRAME = '1';
    expect(buildPreloadAPI().hasNativeWindowFrame).toBe(true);

    delete process.env.SAIKA_LANE_NATIVE_WINDOW_FRAME;
    expect(buildPreloadAPI().hasNativeWindowFrame).toBe(false);
  });
});
