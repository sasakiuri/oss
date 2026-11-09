// SPDX-License-Identifier: MIT
import { afterEach, describe, expect, it, vi } from 'vitest';

import { UpdaterService } from '../src/UpdaterService';

const runtime = vi.hoisted(() => {
  class AppImageUpdater {
    autoDownload = false;
    autoInstallOnAppQuit = true;
    allowDowngrade = true;
    allowPrerelease = false;
    on = vi.fn().mockReturnThis();
    checkForUpdates = vi.fn(async () => undefined);
    quitAndInstall = vi.fn();
  }
  return { AppImageUpdater, updater: new AppImageUpdater(), safe: new AppImageUpdater() };
});
vi.mock('electron-updater', () => ({
  get autoUpdater() {
    return runtime.updater;
  },
  AppImageUpdater: runtime.AppImageUpdater,
}));
vi.mock('../src/SafeAppImageUpdater', () => ({
  SafeAppImageUpdater: class {
    constructor() {
      return runtime.safe;
    }
  },
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('default updater loading', () => {
  it.each([
    ['linux', false, true],
    ['linux', true, false],
    ['linux', undefined, false],
    ['win32', false, false],
    ['darwin', false, false],
  ] as const)(
    'selects the platform installer on %s with quit installation %s',
    async (platform, autoInstallOnAppQuit, safe) => {
      vi.spyOn(process, 'platform', 'get').mockReturnValue(platform);
      const service = new UpdaterService({ isPackaged: true, currentVersion: '1.0.0', autoInstallOnAppQuit });
      await service.checkForUpdates();
      expect(runtime.safe.checkForUpdates).toHaveBeenCalledTimes(safe ? 1 : 0);
      expect(runtime.updater.checkForUpdates).toHaveBeenCalledTimes(safe ? 0 : 1);
    },
  );

  it('retains other Linux updater implementations', async () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
    const original = runtime.updater;
    runtime.updater = { ...original };
    try {
      const service = new UpdaterService({ isPackaged: true, currentVersion: '1.0.0', autoInstallOnAppQuit: false });
      await service.checkForUpdates();
      expect(runtime.updater.checkForUpdates).toHaveBeenCalledOnce();
      expect(runtime.safe.checkForUpdates).not.toHaveBeenCalled();
    } finally {
      runtime.updater = original;
    }
  });
});
