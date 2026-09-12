// SPDX-License-Identifier: MIT
import { afterEach, describe, expect, it, vi } from 'vitest';

import { installAppImage } from '../src/installAppImage';
import { SafeAppImageUpdater } from '../src/SafeAppImageUpdater';

const nativeAutoUpdater = vi.hoisted(() => ({ emit: vi.fn() }));
vi.mock('electron', () => ({ autoUpdater: nativeAutoUpdater }));
vi.mock('../src/installAppImage', () => ({ installAppImage: vi.fn() }));

function setup() {
  const app = { version: '0.3.0', quit: vi.fn() };
  class ReadyUpdater extends SafeAppImageUpdater {
    constructor() {
      super(undefined, app);
      this.downloadedUpdateHelper = {
        file: '/cache/Saika-0.4.0.AppImage',
        downloadedFileInfo: { fileName: 'Saika-0.4.0.AppImage', sha512: 'verified-hash' },
      } as NonNullable<typeof this.downloadedUpdateHelper>;
    }
  }
  const updater = new ReadyUpdater();
  updater.logger = null;
  const onError = vi.fn();
  updater.on('error', onError);
  vi.stubEnv('APPIMAGE', '/applications/Saika-0.3.0.AppImage');
  return { updater, app, onError };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('SafeAppImageUpdater', () => {
  it('waits for installation and process creation before requesting application quit', async () => {
    const { updater, app } = setup();
    let finishInstall!: (destination: string) => void;
    vi.mocked(installAppImage).mockReturnValueOnce(
      new Promise((resolve) => {
        finishInstall = resolve;
      }),
    );

    const installation = updater.quitAndInstall();

    expect(app.quit).not.toHaveBeenCalled();
    expect(nativeAutoUpdater.emit).not.toHaveBeenCalled();
    finishInstall('/applications/Saika-0.4.0.AppImage');
    await installation;
    expect(nativeAutoUpdater.emit).toHaveBeenCalledWith('before-quit-for-update');
    expect(app.quit).toHaveBeenCalledOnce();
  });

  it('reports an installation failure after rollback and permits retry without quitting', async () => {
    const { updater, app, onError } = setup();
    const failure = new Error('replacement failed and was restored');
    vi.mocked(installAppImage)
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce('/applications/Saika-0.4.0.AppImage');

    await expect(updater.quitAndInstall()).rejects.toBe(failure);

    expect(onError).toHaveBeenCalledOnce();
    expect(app.quit).not.toHaveBeenCalled();
    expect(nativeAutoUpdater.emit).not.toHaveBeenCalled();
    await expect(updater.quitAndInstall()).resolves.toBeUndefined();
    expect(app.quit).toHaveBeenCalledOnce();
  });
});
