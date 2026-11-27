// SPDX-License-Identifier: MIT
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useUpdateEvents } from '@/renderer/presentation/hooks/useUpdateEvents';
import { useUpdateStore } from '@/renderer/presentation/stores/updateStore';
import { updateService } from '@/renderer/services/updateService';
import type { AppUpdateStateDto } from '@/shared/ipc/contracts';

vi.mock('@/renderer/services/updateService', () => ({
  updateService: {
    getUpdateState: vi.fn(),
  },
}));

function createState(overrides: Partial<AppUpdateStateDto>): AppUpdateStateDto {
  return {
    status: 'idle',
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
    ...overrides,
  };
}

describe('useUpdateEvents', () => {
  beforeEach(() => {
    useUpdateStore.getState().reset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete (window as Partial<Window>).electronAPI;
  });

  it('does not let a delayed bootstrap response overwrite a newer event state', async () => {
    let resolveInitialState: ((state: AppUpdateStateDto) => void) | null = null;
    vi.mocked(updateService.getUpdateState).mockReturnValue(
      new Promise<AppUpdateStateDto>((resolve) => {
        resolveInitialState = resolve;
      }),
    );

    let updateListener: ((state: AppUpdateStateDto) => void) | null = null;
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      writable: true,
      value: {
        on: {
          updateStateChanged: vi.fn((listener: (state: AppUpdateStateDto) => void) => {
            updateListener = listener;
            return vi.fn();
          }),
        },
      },
    });

    renderHook(() => useUpdateEvents());

    await act(async () => {
      updateListener?.(
        createState({
          status: 'downloaded',
          targetVersion: '0.2.2',
          canCheckForUpdates: false,
          canInstallUpdate: true,
        }),
      );
    });

    expect(useUpdateStore.getState().status).toBe('downloaded');

    await act(async () => {
      resolveInitialState?.(createState({ status: 'idle' }));
      await Promise.resolve();
    });

    expect(useUpdateStore.getState().status).toBe('downloaded');
  });
});
