// SPDX-License-Identifier: MIT
import { EventEmitter } from 'node:events';

import { afterEach, describe, expect, it, vi } from 'vitest';

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

describe('update state transitions and metadata', () => {
  afterEach(() => vi.useRealTimers());

  const emptyMetadata = {
    targetVersion: null,
    releaseName: null,
    releaseDate: null,
    releaseNotes: null,
    downloadPercent: null,
    transferredBytes: null,
    totalBytes: null,
    bytesPerSecond: null,
  };

  it.each([true, false])('publishes a complete initial state (packaged: %s)', (isPackaged) => {
    const { service, onStateChange } = setup({ isPackaged });
    const state = {
      ...emptyMetadata,
      status: isPackaged ? 'idle' : 'unsupported',
      currentVersion: '0.3.0',
      lastCheckedAt: null,
      errorMessage: isPackaged ? null : 'Auto-update is available only in packaged releases.',
      canCheckForUpdates: isPackaged,
      canInstallUpdate: false,
    };
    expect(service.getState()).toEqual(state);
    service.emitCurrentState();
    expect(onStateChange).toHaveBeenCalledExactlyOnceWith(state);
  });

  it('publishes progress, installation readiness and the no-update reset', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-02T03:04:05Z'));
    const now = new Date().toISOString();
    const log = vi.fn();
    const { service, autoUpdater, onStateChange } = setup({ log });
    await service.checkForUpdates();
    autoUpdater.emit('checking-for-update');
    expect(service.getState()).toEqual({
      ...emptyMetadata,
      status: 'checking',
      currentVersion: '0.3.0',
      lastCheckedAt: null,
      errorMessage: null,
      canCheckForUpdates: false,
      canInstallUpdate: false,
    });
    expect(log).toHaveBeenLastCalledWith('info', 'Updater: checking for updates.');
    autoUpdater.emit('update-available', {
      version: '0.4.0',
      releaseName: 'Release',
      releaseDate: new Date('2026-01-01Z'),
      releaseNotes: ' Notes ',
    });
    const available = {
      ...emptyMetadata,
      status: 'available',
      currentVersion: '0.3.0',
      targetVersion: '0.4.0',
      releaseName: 'Release',
      releaseDate: '2026-01-01T00:00:00.000Z',
      releaseNotes: 'Notes',
      lastCheckedAt: now,
      errorMessage: null,
      canCheckForUpdates: false,
      canInstallUpdate: false,
    };
    expect(service.getState()).toEqual(available);
    expect(log).toHaveBeenLastCalledWith('info', 'Updater: update available (0.4.0).');
    autoUpdater.emit('download-progress', { percent: 25, transferred: 100, total: 400, bytesPerSecond: 50 });
    expect(service.getState()).toEqual({
      ...available,
      status: 'downloading',
      downloadPercent: 25,
      transferredBytes: 100,
      totalBytes: 400,
      bytesPerSecond: 50,
    });
    await service.checkForUpdates();
    expect(autoUpdater.checkForUpdates).toHaveBeenCalledOnce();
    autoUpdater.emit('update-downloaded', { version: '0.4.0' });
    const downloaded = {
      ...available,
      status: 'downloaded',
      downloadPercent: 100,
      transferredBytes: 400,
      totalBytes: 400,
      bytesPerSecond: 50,
      canInstallUpdate: true,
    };
    expect(service.getState()).toEqual(downloaded);
    expect(log).toHaveBeenLastCalledWith('info', 'Updater: update downloaded (0.4.0).');
    expect(onStateChange).toHaveBeenLastCalledWith(downloaded);
    expect(await service.checkForUpdates()).toEqual(downloaded);
    expect(autoUpdater.checkForUpdates).toHaveBeenCalledOnce();
    autoUpdater.emit('update-not-available');
    expect(service.getState()).toEqual({
      ...emptyMetadata,
      status: 'no-update',
      currentVersion: '0.3.0',
      lastCheckedAt: now,
      errorMessage: null,
      canCheckForUpdates: true,
      canInstallUpdate: false,
    });
    expect(log).toHaveBeenLastCalledWith('info', 'Updater: application is up to date.');
  });

  it.each([
    [undefined, null],
    [null, null],
    ['', null],
    ['  ', null],
    [' text ', 'text'],
    [{ note: 'ignored' }, null],
    [[], null],
    [[null, 12, {}, { note: 42, version: 42 }, { version: 'v1' }, { note: '' }, '  '], null],
    [
      [
        ' first ',
        { note: ' second ', version: ' v2 ' },
        { note: ' third ' },
        { note: ' fourth ', version: 2 },
        { note: ' fifth ', version: '' },
      ],
      'first\n\nv2\nsecond\n\nthird\n\nfourth\n\nfifth',
    ],
  ])('normalizes release notes %j', async (releaseNotes, expected) => {
    const { service, autoUpdater } = setup();
    await service.checkForUpdates();
    autoUpdater.emit('update-available', { version: '0.4.0', releaseNotes });
    expect(service.getState().releaseNotes).toBe(expected);
  });

  it.each([undefined, null, '', '  ', '2026-01-01'])('normalizes release date %j', async (releaseDate) => {
    const { service, autoUpdater } = setup();
    await service.checkForUpdates();
    autoUpdater.emit('update-available', { version: '0.4.0', releaseDate });
    expect(service.getState().releaseDate).toBe(releaseDate === '2026-01-01' ? releaseDate : null);
    expect(service.getState().releaseName).toBeNull();
  });

  it('uses downloaded metadata when supplied and preserves transferred bytes without a total', async () => {
    const { service, autoUpdater } = setup();
    await service.checkForUpdates();
    autoUpdater.emit('download-progress', { percent: 10, transferred: 5, total: null, bytesPerSecond: 1 });
    autoUpdater.emit('update-downloaded', {
      version: '0.4.0',
      releaseName: 'Final',
      releaseDate: '2026-01-02',
      releaseNotes: 'Final notes',
    });
    expect(service.getState()).toMatchObject({
      releaseName: 'Final',
      releaseDate: '2026-01-02',
      releaseNotes: 'Final notes',
      transferredBytes: 5,
    });
  });

  it.each([new Error('broken'), 'network error', new Error(' '), ' ', {}, null])(
    'reports check failures and clears stale progress (%j)',
    async (failure) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-01Z'));
      const log = vi.fn();
      const { service, autoUpdater } = setup({ log });
      autoUpdater.checkForUpdates.mockRejectedValueOnce(failure);
      const expected =
        failure instanceof Error && failure.message.trim()
          ? failure.message
          : typeof failure === 'string' && failure.trim()
            ? failure
            : 'Unknown updater error';
      expect(await service.checkForUpdates()).toEqual({
        ...emptyMetadata,
        status: 'error',
        currentVersion: '0.3.0',
        lastCheckedAt: '2026-01-01T00:00:00.000Z',
        errorMessage: expected,
        canCheckForUpdates: true,
        canInstallUpdate: false,
      });
      expect(log).toHaveBeenLastCalledWith('warn', 'Updater: failed to complete update operation.', {
        error: expected,
      });
      expect(await service.checkForUpdates()).toMatchObject({ status: 'checking', errorMessage: null });
    },
  );

  it('coalesces pending checks and attaches event handlers only once after retries', async () => {
    const { service, autoUpdater, loadAutoUpdater } = setup();
    let resolveCheck!: () => void;
    autoUpdater.checkForUpdates.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveCheck = resolve;
        }),
    );
    const first = service.checkForUpdates();
    const second = service.checkForUpdates();
    await vi.waitFor(() => expect(autoUpdater.checkForUpdates).toHaveBeenCalledOnce());
    resolveCheck();
    expect(await first).toEqual(await second);
    expect(await service.checkForUpdates()).toMatchObject({ status: 'checking' });
    autoUpdater.emit('update-not-available');
    await service.checkForUpdates();
    expect(loadAutoUpdater).toHaveBeenCalledOnce();
    expect(autoUpdater.listenerCount('update-available')).toBe(1);
    expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(2);
  });

  it('rejects unsupported custom feeds before checking and permits a loader retry', async () => {
    const brokenUpdater = new FakeAutoUpdater();
    Reflect.deleteProperty(brokenUpdater, 'setFeedURL');
    const loadAutoUpdater = vi
      .fn()
      .mockResolvedValueOnce({ autoUpdater: brokenUpdater })
      .mockRejectedValueOnce(new Error('load failed'));
    const { service } = setup({ metadataNamespace: 'vista', loadAutoUpdater });
    expect(await service.checkForUpdates()).toMatchObject({
      status: 'error',
      errorMessage: 'The updater does not support a custom update provider.',
    });
    expect(brokenUpdater.checkForUpdates).not.toHaveBeenCalled();
    expect(await service.checkForUpdates()).toMatchObject({ status: 'error', errorMessage: 'load failed' });
  });
});

describe('update operation boundaries', () => {
  it('waits for an update before installing and accepts an empty download result', async () => {
    const { service, autoUpdater } = setup();
    autoUpdater.checkForUpdates.mockResolvedValueOnce({ downloadPromise: null });
    expect(await service.checkForUpdates()).toMatchObject({ status: 'checking', canCheckForUpdates: false });
    await expect(service.quitAndInstall()).rejects.toThrow('No downloaded update is ready to install.');
    expect(autoUpdater.quitAndInstall).not.toHaveBeenCalled();
    autoUpdater.emit('update-not-available');
    autoUpdater.checkForUpdates.mockResolvedValueOnce({});
    expect(await service.checkForUpdates()).toMatchObject({ status: 'checking', errorMessage: null });
  });

  it.each(['12.34.56-rc.1', '1.2.3-rc'])('uses the release-candidate feed for %s', async (currentVersion) => {
    const { service, autoUpdater } = setup({ currentVersion });
    await service.checkForUpdates();
    expect(autoUpdater.setFeedURL).toHaveBeenCalledOnce();
  });

  it('allows notifications without a logging or state observer', async () => {
    const { service, autoUpdater } = setup({ onStateChange: undefined, log: undefined });
    await service.checkForUpdates();
    autoUpdater.emit('checking-for-update');
    expect(service.getState().status).toBe('checking');
  });

  it('reports a distinct installer rejection after an emitted error', async () => {
    const log = vi.fn();
    const { service, autoUpdater } = setup({ log });
    await downloadUpdate(service, autoUpdater);
    log.mockClear();
    autoUpdater.quitAndInstall.mockImplementationOnce(() => {
      autoUpdater.emit('error', new Error('native error'));
      throw new Error('launcher error');
    });
    await expect(service.quitAndInstall()).rejects.toThrow('launcher error');
    expect(log).toHaveBeenCalledTimes(2);
    expect(service.getState()).toMatchObject({ errorMessage: 'launcher error', canInstallUpdate: true });
  });
});
