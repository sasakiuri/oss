// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ServiceError } from '@/renderer/services/createServiceMethod';

const mockGetUpdateState = vi.fn();
const mockCheckForUpdates = vi.fn();
const mockQuitAndInstall = vi.fn();

vi.stubGlobal('window', {
  electronAPI: {
    updates: {
      getUpdateState: mockGetUpdateState,
      checkForUpdates: mockCheckForUpdates,
      quitAndInstall: mockQuitAndInstall,
    },
  },
});

const { updateService } = await import('@/renderer/services/updateService');

describe('updateService', () => {
  const updateState = {
    status: 'idle' as const,
    currentVersion: '0.2.1',
    targetVersion: null,
    releaseName: null,
    releaseDate: null,
    releaseNotes: null,
    downloadPercent: null,
    transferredBytes: null,
    totalBytes: null,
    bytesPerSecond: null,
    lastCheckedAt: null,
    errorMessage: null,
    canCheckForUpdates: true,
    canInstallUpdate: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getUpdateState returns updater state on success', async () => {
    mockGetUpdateState.mockResolvedValue({ success: true, data: updateState });

    await expect(updateService.getUpdateState()).resolves.toEqual(updateState);
    expect(mockGetUpdateState).toHaveBeenCalledTimes(1);
  });

  it('checkForUpdates returns the latest updater state on success', async () => {
    const checkingState = {
      ...updateState,
      status: 'checking' as const,
      canCheckForUpdates: false,
    };
    mockCheckForUpdates.mockResolvedValue({ success: true, data: checkingState });

    await expect(updateService.checkForUpdates()).resolves.toEqual(checkingState);
    expect(mockCheckForUpdates).toHaveBeenCalledTimes(1);
  });

  it('quitAndInstall resolves to void on success', async () => {
    mockQuitAndInstall.mockResolvedValue({ success: true });

    await expect(updateService.quitAndInstall()).resolves.toBeUndefined();
    expect(mockQuitAndInstall).toHaveBeenCalledTimes(1);
  });

  it('throws ServiceError when getUpdateState fails', async () => {
    mockGetUpdateState.mockResolvedValue({
      success: false,
      error: { code: 'UPDATER_ERROR', message: 'Unavailable' },
    });

    await expect(updateService.getUpdateState()).rejects.toThrow(ServiceError);
  });
});
