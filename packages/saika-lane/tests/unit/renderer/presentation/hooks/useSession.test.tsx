// SPDX-License-Identifier: MIT
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useSession } from '@/renderer/presentation/hooks/useSession';
import { useSessionStore } from '@/renderer/presentation/stores/sessionStore';
import { ServiceError } from '@/renderer/services/createServiceMethod';
import { sessionService } from '@/renderer/services/sessionService';
import type { ShotDto } from '@/shared/ipc/contracts';

// Mock service modules
vi.mock('@/renderer/services/sessionService', () => ({
  sessionService: {
    switchMode: vi.fn(),
  },
}));

const mockSwitchMode = vi.mocked(sessionService.switchMode);

describe('useSession', () => {
  beforeEach(() => {
    // Reset store before each test
    const { resetSession } = useSessionStore.getState();
    resetSession();

    // Reset mock functions
    vi.clearAllMocks();
  });

  it('returns the current session id from the store', () => {
    const { result } = renderHook(() => useSession());
    expect(result.current.currentSessionId).toBeNull();

    act(() => {
      useSessionStore.getState().setSessionId('session-1');
    });

    expect(result.current.currentSessionId).toBe('session-1');
  });

  describe('switchMode', () => {
    it.each(['SIGHTING', 'MATCH'] as const)('starts an empty %s series without discarding history', async (mode) => {
      const shot: ShotDto = {
        id: 'shot-1',
        shotNumber: 1,
        x: 0,
        y: 0,
        score: 100,
        innerTen: false,
        timestamp: '2026-10-29T00:00:00Z',
        mode: 'SIGHTING',
        isRecorded: false,
      };
      useSessionStore.getState().setSessionId('session-1');
      useSessionStore.getState().addShot(shot);
      mockSwitchMode.mockImplementationOnce(async () => {
        useSessionStore.getState().addShot({ ...shot, id: 'shot-2', shotNumber: 2, mode });
      });
      const { result } = renderHook(() => useSession());
      await act(async () => {
        await result.current.switchMode(mode);
      });
      expect(useSessionStore.getState().currentSeriesStartIndex).toBe(1);
      expect(useSessionStore.getState().shots).toHaveLength(2);
      expect(useSessionStore.getState().mode).toBe(mode);
    });

    it('keeps the current series boundary when switching fails', async () => {
      useSessionStore.getState().setSessionId('session-1');
      useSessionStore.getState().setCurrentSeriesStartIndex(2);
      mockSwitchMode.mockRejectedValueOnce(new Error('Failed'));
      const { result } = renderHook(() => useSession());
      await act(async () => {
        await expect(result.current.switchMode('MATCH')).rejects.toThrow('Failed');
      });
      expect(useSessionStore.getState().currentSeriesStartIndex).toBe(2);
    });

    beforeEach(() => {
      useSessionStore.getState().setSessionId('session-123');
      useSessionStore.getState().setDiscipline('AIR_RIFLE_10M');
    });

    it('succeeds in switching mode', async () => {
      // Service returns void on success
      mockSwitchMode.mockResolvedValue(undefined);

      const { result } = renderHook(() => useSession());

      await act(async () => {
        await result.current.switchMode('MATCH');
      });

      expect(mockSwitchMode).toHaveBeenCalledWith({
        sessionId: 'session-123',
        mode: 'MATCH',
      });

      // Verify store is updated
      const storeState = useSessionStore.getState();
      expect(storeState.mode).toBe('MATCH');
    });

    it('throws an error when session has not been started', async () => {
      // Reset store to session-not-started state
      const { resetSession } = useSessionStore.getState();
      resetSession();

      const { result } = renderHook(() => useSession());

      let thrownError: Error | undefined;
      await act(async () => {
        try {
          await result.current.switchMode('MATCH');
        } catch (err) {
          thrownError = err as Error;
        }
      });

      expect(thrownError?.message).toBe('Session has not been started');
      expect(mockSwitchMode).not.toHaveBeenCalled();
    });

    it('rejects with the service error and leaves the mode', async () => {
      mockSwitchMode.mockRejectedValue(new ServiceError('Failed to switch mode', 'SWITCH_MODE_FAILED'));

      const { result } = renderHook(() => useSession());

      let thrownError: Error | undefined;
      await act(async () => {
        try {
          await result.current.switchMode('MATCH');
        } catch (err) {
          thrownError = err as Error;
        }
      });

      expect(thrownError?.message).toBe('Failed to switch mode');

      // Verify store is not changed
      const storeState = useSessionStore.getState();
      expect(storeState.mode).toBe('SIGHTING');
    });

    it('replaces a rejection that is not an Error with the default message', async () => {
      mockSwitchMode.mockRejectedValue('string error');

      const { result } = renderHook(() => useSession());

      let thrownError: Error | undefined;
      await act(async () => {
        try {
          await result.current.switchMode('MATCH');
        } catch (err) {
          thrownError = err as Error;
        }
      });

      expect(thrownError).toBeInstanceOf(Error);
      expect(thrownError?.message).toBe('An error occurred while switching mode');
    });

    it('can switch again after a failure', async () => {
      mockSwitchMode.mockRejectedValueOnce(new Error('Temporary error')).mockResolvedValueOnce(undefined);
      const { result } = renderHook(() => useSession());

      await act(async () => {
        await expect(result.current.switchMode('MATCH')).rejects.toThrow('Temporary error');
      });
      await act(async () => {
        await result.current.switchMode('MATCH');
      });

      expect(useSessionStore.getState().mode).toBe('MATCH');
    });
  });
});
