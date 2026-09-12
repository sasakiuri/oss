// SPDX-License-Identifier: MIT
import { EventEmitter } from 'node:events';

import { describe, expect, it, vi } from 'vitest';

import { UpdaterService, type AutoUpdaterLike, type UpdaterServiceOptions } from '../src/UpdaterService';

class FakeAutoUpdater extends EventEmitter {
  autoDownload = false;
  autoInstallOnAppQuit = true;
  allowPrerelease = false;
  allowDowngrade = true;
  setFeedURL = vi.fn();
  checkForUpdates = vi.fn<AutoUpdaterLike['checkForUpdates']>(async () => undefined);
  quitAndInstall = vi.fn();
}

function setup(options: Partial<UpdaterServiceOptions> = {}) {
  const autoUpdater = new FakeAutoUpdater();
  const onStateChange = vi.fn();
  const loadAutoUpdater = vi.fn(async () => ({ autoUpdater }));
  const service = new UpdaterService({
    currentVersion: '0.3.0',
    isPackaged: true,
    onStateChange,
    loadAutoUpdater,
    ...options,
  });
  return { autoUpdater, onStateChange, loadAutoUpdater, service };
}

async function downloadUpdate(service: UpdaterService, autoUpdater: FakeAutoUpdater) {
  await service.checkForUpdates();
  autoUpdater.emit('update-downloaded', { version: '0.4.0' });
}

describe('UpdaterService', () => {
  it('does not load the updater or notify state during construction', async () => {
    const { service, loadAutoUpdater, onStateChange } = setup({ isPackaged: false });

    expect(loadAutoUpdater).not.toHaveBeenCalled();
    expect(onStateChange).not.toHaveBeenCalled();
    expect((await service.checkForUpdates()).status).toBe('unsupported');
    expect(loadAutoUpdater).not.toHaveBeenCalled();
    expect(onStateChange).toHaveBeenCalledOnce();
    await expect(service.quitAndInstall()).rejects.toThrow('No downloaded update');
  });

  it('downloads automatically but waits for an explicit install when configured', async () => {
    const { service, autoUpdater } = setup({ autoInstallOnAppQuit: false });

    await downloadUpdate(service, autoUpdater);

    expect(autoUpdater.autoDownload).toBe(true);
    expect(autoUpdater.autoInstallOnAppQuit).toBe(false);
    expect(autoUpdater.allowDowngrade).toBe(false);
    expect(autoUpdater.quitAndInstall).not.toHaveBeenCalled();
    await service.quitAndInstall();
    expect(autoUpdater.quitAndInstall).toHaveBeenCalledWith(false, true);
  });

  it('reports an inactive packaged updater as unsupported instead of leaving a pending check', async () => {
    const { service, autoUpdater } = setup();
    autoUpdater.checkForUpdates.mockResolvedValueOnce(null);

    expect(await service.checkForUpdates()).toMatchObject({
      status: 'unsupported',
      canCheckForUpdates: false,
      errorMessage: 'Auto-update is not available for this installation.',
    });
    await service.checkForUpdates();
    expect(autoUpdater.checkForUpdates).toHaveBeenCalledOnce();
  });

  it('consumes a later download rejection while reporting its error event only once', async () => {
    const { service, autoUpdater, onStateChange } = setup();
    let failDownload!: (error: Error) => void;
    const downloadPromise = new Promise<void>((_resolve, reject) => {
      failDownload = reject;
    });
    autoUpdater.checkForUpdates.mockImplementationOnce(async () => {
      autoUpdater.emit('update-available', { version: '0.4.0' });
      return { downloadPromise };
    });

    expect((await service.checkForUpdates()).status).toBe('available');
    onStateChange.mockClear();
    const failure = new Error('download interrupted');
    autoUpdater.emit('error', failure);
    failDownload(failure);
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(service.getState()).toMatchObject({ status: 'error', canCheckForUpdates: true });
    expect(onStateChange).toHaveBeenCalledOnce();
    await service.checkForUpdates();
    expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(2);
  });

  it.each(['director', 'vista'] as const)(
    'configures isolated %s metadata and keeps prereleases enabled',
    async (namespace) => {
      const { service, autoUpdater } = setup({ metadataNamespace: namespace, currentVersion: '0.3.0-beta.1' });

      await service.checkForUpdates();

      expect(autoUpdater.setFeedURL).toHaveBeenCalledWith({
        provider: 'custom',
        updateProvider: expect.any(Function),
        metadataNamespace: namespace,
      });
      expect(autoUpdater.allowPrerelease).toBe(true);
    },
  );

  it('keeps the packaged update feed for Lane', async () => {
    const { service, autoUpdater } = setup();

    await service.checkForUpdates();

    expect(autoUpdater.setFeedURL).not.toHaveBeenCalled();
    expect(autoUpdater.autoInstallOnAppQuit).toBe(true);
    expect(autoUpdater.allowPrerelease).toBe(false);
  });

  it('enables RC-to-stable updates for Lane without a metadata namespace', async () => {
    const { service, autoUpdater } = setup({ currentVersion: '0.3.0-rc.1' });

    await service.checkForUpdates();

    expect(autoUpdater.setFeedURL).toHaveBeenCalledWith({
      provider: 'custom',
      updateProvider: expect.any(Function),
      metadataNamespace: undefined,
    });
    expect(autoUpdater.allowPrerelease).toBe(true);
    expect(autoUpdater.allowDowngrade).toBe(false);
  });

  it('waits for pending application writes and coalesces simultaneous install requests', async () => {
    let finishWrites!: () => void;
    const pendingWrites = new Promise<void>((resolve) => {
      finishWrites = resolve;
    });
    const beforeInstall = vi.fn(() => pendingWrites);
    const { service, autoUpdater } = setup({ beforeInstall });
    await downloadUpdate(service, autoUpdater);

    const firstInstall = service.quitAndInstall();
    const secondInstall = service.quitAndInstall();

    expect(beforeInstall).toHaveBeenCalledOnce();
    expect(autoUpdater.quitAndInstall).not.toHaveBeenCalled();
    finishWrites();
    await Promise.all([firstInstall, secondInstall]);
    expect(autoUpdater.quitAndInstall).toHaveBeenCalledOnce();
  });

  it('does not quit when preparation fails and permits a later install retry', async () => {
    const beforeInstall = vi.fn().mockRejectedValueOnce(new Error('save failed')).mockResolvedValueOnce(undefined);
    const { service, autoUpdater, onStateChange } = setup({ beforeInstall });
    await downloadUpdate(service, autoUpdater);

    await expect(service.quitAndInstall()).rejects.toThrow('save failed');

    expect(autoUpdater.quitAndInstall).not.toHaveBeenCalled();
    expect(onStateChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: 'error',
        errorMessage: 'save failed',
        canInstallUpdate: true,
        canCheckForUpdates: false,
      }),
    );
    await service.quitAndInstall();
    expect(beforeInstall).toHaveBeenCalledTimes(2);
    expect(autoUpdater.quitAndInstall).toHaveBeenCalledOnce();
  });

  it('reports a synchronous installer failure and keeps the downloaded update ready', async () => {
    const { service, autoUpdater } = setup();
    await downloadUpdate(service, autoUpdater);
    autoUpdater.quitAndInstall.mockImplementationOnce(() => {
      throw new Error('install failed');
    });

    await expect(service.quitAndInstall()).rejects.toThrow('install failed');

    expect(service.getState()).toMatchObject({ status: 'error', canInstallUpdate: true });
    await expect(service.quitAndInstall()).resolves.toBeUndefined();
  });

  it('rejects an emitted installer error even when the native install call returns normally', async () => {
    const log = vi.fn();
    const { service, autoUpdater, onStateChange } = setup({ log });
    await downloadUpdate(service, autoUpdater);
    onStateChange.mockClear();
    log.mockClear();
    const failure = new Error('installer could not start');
    autoUpdater.quitAndInstall.mockImplementationOnce(() => {
      autoUpdater.emit('error', failure);
    });

    await expect(service.quitAndInstall()).rejects.toBe(failure);

    expect(service.getState()).toMatchObject({
      status: 'error',
      errorMessage: 'installer could not start',
      canInstallUpdate: true,
      canCheckForUpdates: false,
    });
    expect(onStateChange).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledOnce();
    await expect(service.quitAndInstall()).resolves.toBeUndefined();
    expect(autoUpdater.quitAndInstall).toHaveBeenCalledTimes(2);
  });

  it('waits for an asynchronous installer and reports a later emitted rejection once', async () => {
    const { service, autoUpdater, onStateChange } = setup();
    await downloadUpdate(service, autoUpdater);
    onStateChange.mockClear();
    let finishLaunch!: () => void;
    const launchPending = new Promise<void>((resolve) => {
      finishLaunch = resolve;
    });
    const failure = new Error('process creation failed');
    autoUpdater.quitAndInstall.mockImplementationOnce(async () => {
      await launchPending;
      autoUpdater.emit('error', failure);
      throw failure;
    });
    const installation = service.quitAndInstall();
    let completed = false;
    const completion = installation.catch(() => {
      completed = true;
    });
    await vi.waitFor(() => expect(autoUpdater.quitAndInstall).toHaveBeenCalledOnce());
    expect(completed).toBe(false);

    finishLaunch();
    await expect(installation).rejects.toBe(failure);
    await completion;

    expect(onStateChange).toHaveBeenCalledOnce();
    expect(service.getState().canInstallUpdate).toBe(true);
  });

  it('avoids checking again while automatic download is waiting for progress events', async () => {
    const { service, autoUpdater } = setup();
    autoUpdater.checkForUpdates.mockImplementationOnce(async () => {
      autoUpdater.emit('update-available', { version: '0.4.0' });
    });

    await service.checkForUpdates();
    await service.checkForUpdates();

    expect(service.getState().status).toBe('available');
    expect(autoUpdater.checkForUpdates).toHaveBeenCalledOnce();
  });

  it('retries custom provider setup after failure', async () => {
    const { service, autoUpdater, loadAutoUpdater } = setup({ metadataNamespace: 'director' });
    autoUpdater.setFeedURL.mockImplementationOnce(() => {
      throw new Error('configuration failed');
    });

    expect((await service.checkForUpdates()).status).toBe('error');
    expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled();
    await service.checkForUpdates();

    expect(loadAutoUpdater).toHaveBeenCalledTimes(2);
    expect(autoUpdater.setFeedURL).toHaveBeenCalledTimes(2);
    expect(autoUpdater.checkForUpdates).toHaveBeenCalledOnce();
  });
});
