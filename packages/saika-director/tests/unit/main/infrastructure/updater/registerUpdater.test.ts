// SPDX-License-Identifier: MIT
import type { UpdaterService } from '@sasakiuri/saika-updater/main';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WindowManager } from '@/main/infrastructure/window/WindowManager';
import { registerUpdater } from '@/main/infrastructure/updater/registerUpdater';
import { IpcRouter } from '@/main/shared-infra/ipc/IpcRouter';
import { updaterContract } from '@/shared/ipc/contracts/updater.contract';

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown) => Promise<unknown>>(),
  showMessageBoxSync: vi.fn(),
  window: { isDestroyed: () => false },
}));
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (event: unknown) => Promise<unknown>) => mocks.handlers.set(channel, handler),
  },
  BrowserWindow: { fromWebContents: () => mocks.window },
  dialog: { showMessageBoxSync: mocks.showMessageBoxSync },
}));

const state = {
  status: 'downloaded',
  currentVersion: '0.3.0',
  targetVersion: '0.3.1',
  releaseName: null,
  releaseDate: null,
  releaseNotes: null,
  downloadPercent: 100,
  transferredBytes: 100,
  totalBytes: 100,
  bytesPerSecond: 0,
  lastCheckedAt: null,
  errorMessage: null,
  canCheckForUpdates: false,
  canInstallUpdate: true,
};

function setup(windowId: string | null = 'main') {
  const order: string[] = [];
  const updater = {
    getState: vi.fn(() => state),
    checkForUpdates: vi.fn(async () => state),
    quitAndInstall: vi.fn(async () => {
      order.push('install');
    }),
  };
  const windowManager = { findWindowIdByWebContents: () => windowId } as unknown as WindowManager;
  const router = new IpcRouter({
    invoke: async (_context, next) => {
      const result = await next();
      order.push('audit');
      return result;
    },
  });
  registerUpdater(router, updater as unknown as UpdaterService, windowManager);
  const frame = {};
  const event = { sender: { id: 1, mainFrame: frame }, senderFrame: frame };
  const invoke = (operation: keyof typeof updaterContract.channels, input = event) =>
    mocks.handlers.get(updaterContract.channels[operation])!(input);
  return { updater, order, invoke, event };
}

describe('Director updater IPC', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.handlers.clear();
    mocks.showMessageBoxSync.mockReturnValue(1);
  });

  it('returns the shared state and checks through the typed router', async () => {
    const { invoke, updater } = setup();
    expect(await invoke('getUpdateState')).toEqual({ success: true, data: state });
    expect(await invoke('checkForUpdates')).toEqual({ success: true, data: state });
    expect(updater.checkForUpdates).toHaveBeenCalledOnce();
  });

  it.each(['board-window', null])('rejects updates from a non-main sender (%s)', async (windowId) => {
    const { invoke, updater } = setup(windowId);
    expect(await invoke('quitAndInstall')).toMatchObject({ success: false });
    expect(await invoke('checkForUpdates')).toMatchObject({ success: false });
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
  });

  it('rejects a child-frame sender', async () => {
    const { invoke, event } = setup();
    expect(await invoke('quitAndInstall', { ...event, senderFrame: {} })).toMatchObject({ success: false });
    expect(mocks.showMessageBoxSync).not.toHaveBeenCalled();
  });

  it('keeps operating when restart confirmation is cancelled', async () => {
    const { invoke, updater } = setup();
    expect(await invoke('quitAndInstall')).toMatchObject({ success: true });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
    expect(mocks.showMessageBoxSync).toHaveBeenCalledWith(
      mocks.window,
      expect.objectContaining({ defaultId: 1, cancelId: 1 }),
    );
  });

  it('finishes the operator audit before shutdown and ignores duplicate install requests', async () => {
    mocks.showMessageBoxSync.mockReturnValue(0);
    const { invoke, updater, order } = setup();
    await invoke('quitAndInstall');
    await invoke('quitAndInstall');
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(order).toEqual(['audit', 'audit', 'install']);
    expect(updater.quitAndInstall).toHaveBeenCalledOnce();
    expect(mocks.showMessageBoxSync).toHaveBeenCalledOnce();
  });

  it('rejects installation until a download is ready', async () => {
    const { invoke, updater } = setup();
    updater.getState.mockReturnValue({ ...state, canInstallUpdate: false });
    expect(await invoke('quitAndInstall')).toMatchObject({ success: false });
    expect(mocks.showMessageBoxSync).not.toHaveBeenCalled();
  });
});
