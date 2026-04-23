// SPDX-License-Identifier: MIT
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useSavedSettingsRestore } from '@/renderer/presentation/hooks/useSavedSettingsRestore';
import { useLogStore } from '@/renderer/presentation/stores/logStore';
import { useSessionStore } from '@/renderer/presentation/stores/sessionStore';
import { settingsService } from '@/renderer/services/settingsService';

vi.mock('@/renderer/services/settingsService', () => ({
  settingsService: {
    getUserPreferences: vi.fn(),
  },
}));

const mockGetUserPreferences = settingsService.getUserPreferences as ReturnType<typeof vi.fn>;

describe('useSavedSettingsRestore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSessionStore.getState().resetSession();
  });

  it('applies saved discipline to sessionStore', async () => {
    mockGetUserPreferences.mockResolvedValue({
      discipline: 'AIR_RIFLE_10M',
    });

    renderHook(() => useSavedSettingsRestore());

    await waitFor(() => {
      expect(useSessionStore.getState().discipline).toBe('AIR_RIFLE_10M');
    });
  });

  it('applies saved laneNumber to sessionStore', async () => {
    mockGetUserPreferences.mockResolvedValue({
      laneNumber: 3,
    });

    renderHook(() => useSavedSettingsRestore());

    await waitFor(() => {
      expect(useSessionStore.getState().laneNumber).toBe(3);
    });
  });

  it('does not overwrite a laneNumber changed while restore is still pending', async () => {
    let resolvePreferences: ((value: { laneNumber: number }) => void) | undefined;
    mockGetUserPreferences.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePreferences = resolve;
        }),
    );

    renderHook(() => useSavedSettingsRestore());

    act(() => {
      useSessionStore.getState().setLaneNumber(9);
    });

    await act(async () => {
      resolvePreferences?.({ laneNumber: 3 });
    });

    await waitFor(() => {
      expect(useSessionStore.getState().laneNumber).toBe(9);
    });
  });

  it('does not crash when getUserPreferences fails', async () => {
    mockGetUserPreferences.mockRejectedValue(new Error('storage failure'));
    useLogStore.getState().clearEntries();

    renderHook(() => useSavedSettingsRestore());

    await waitFor(() => {
      const entries = useLogStore.getState().entries;
      expect(entries).toHaveLength(1);
      const entry = entries[0]!;
      expect(entry.level).toBe('error');
      expect(entry.message).toContain('Failed to load user preferences:');
      expect(entry.message).toContain('storage failure');
      expect(entry.source).toBe('renderer');
    });
  });

  it('applies saved audioVolume to sessionStore', async () => {
    mockGetUserPreferences.mockResolvedValue({
      audioVolume: 75,
    });

    renderHook(() => useSavedSettingsRestore());

    await waitFor(() => {
      expect(useSessionStore.getState().audioVolume).toBe(75);
    });
  });

  it('does not change sessionStore when discipline is undefined', async () => {
    const initialDiscipline = useSessionStore.getState().discipline;
    mockGetUserPreferences.mockResolvedValue({});

    renderHook(() => useSavedSettingsRestore());

    await waitFor(() => {
      expect(mockGetUserPreferences).toHaveBeenCalled();
    });

    expect(useSessionStore.getState().discipline).toBe(initialDiscipline);
  });
});
