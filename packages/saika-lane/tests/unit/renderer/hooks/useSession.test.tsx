// SPDX-License-Identifier: MIT
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useSession } from '@/renderer/presentation/hooks/useSession';
import { useSessionStore } from '@/renderer/presentation/stores/sessionStore';
import { ServiceError } from '@/renderer/services/createServiceMethod';
import { sessionService } from '@/renderer/services/sessionService';

// Mock service modules
vi.mock('@/renderer/services/sessionService', () => ({
  sessionService: {
    startSession: vi.fn(),
    switchMode: vi.fn(),
    resetSession: vi.fn(),
    getSessionScore: vi.fn(),
    getShotHistory: vi.fn(),
  },
}));

const mockStartSession = vi.mocked(sessionService.startSession);
const mockSwitchMode = vi.mocked(sessionService.switchMode);
const mockResetSession = vi.mocked(sessionService.resetSession);

describe('useSession', () => {
  beforeEach(() => {
    // Reset store before each test
    const { resetSession } = useSessionStore.getState();
    resetSession();

    // Reset mock functions
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('initializes correctly with default values', () => {
      const { result } = renderHook(() => useSession());

      expect(result.current.currentSessionId).toBeNull();
      expect(result.current.mode).toBe('SIGHTING');
      expect(result.current.totalScore).toBe(0);
      expect(result.current.seriesScores).toEqual([]);
    });

    it('loading state is false', () => {
      const { result } = renderHook(() => useSession());

      expect(result.current.isStarting).toBe(false);
      expect(result.current.isSwitching).toBe(false);
      expect(result.current.isResetting).toBe(false);
    });

    it('error state is null', () => {
      const { result } = renderHook(() => useSession());

      expect(result.current.error).toBeNull();
    });
  });

  describe('startSession', () => {
    it('succeeds in starting session', async () => {
      // Service returns unwrapped data directly
      mockStartSession.mockResolvedValue({ sessionId: 'session-123' });

      const { result } = renderHook(() => useSession());

      await act(async () => {
        await result.current.startSession('AIR_RIFLE_10M');
      });

      expect(mockStartSession).toHaveBeenCalledWith({
        discipline: 'AIR_RIFLE_10M',
      });

      expect(result.current.isStarting).toBe(false);
      expect(result.current.error).toBeNull();

      // Verify store is updated
      const storeState = useSessionStore.getState();
      expect(storeState.currentSessionId).toBe('session-123');
    });

    it('isStarting is true while starting session', async () => {
      let resolveStart: (value: { sessionId: string }) => void;
      const startPromise = new Promise<{ sessionId: string }>((resolve) => {
        resolveStart = resolve;
      });

      mockStartSession.mockReturnValue(startPromise);

      const { result } = renderHook(() => useSession());

      act(() => {
        result.current.startSession('AIR_RIFLE_10M');
      });

      expect(result.current.isStarting).toBe(true);

      await act(async () => {
        resolveStart!({ sessionId: 'session-123' });
        await startPromise;
      });

      expect(result.current.isStarting).toBe(false);
    });

    it('sets error state on session start error', async () => {
      // Service throws ServiceError on failure
      mockStartSession.mockRejectedValue(new ServiceError('Failed to start session', 'SESSION_START_FAILED'));

      const { result } = renderHook(() => useSession());

      let thrownError: Error | undefined;
      await act(async () => {
        try {
          await result.current.startSession('AIR_RIFLE_10M');
        } catch (err) {
          thrownError = err as Error;
        }
      });

      expect(thrownError?.message).toBe('Failed to start session');
      expect(result.current.error?.message).toBe('Failed to start session');
      expect(result.current.isStarting).toBe(false);

      // Verify store is not updated
      const storeState = useSessionStore.getState();
      expect(storeState.currentSessionId).toBeNull();
    });

    it('catches exceptions during session start and sets error state', async () => {
      mockStartSession.mockRejectedValue(new Error('Unexpected error'));

      const { result } = renderHook(() => useSession());

      let thrownError: Error | undefined;
      await act(async () => {
        try {
          await result.current.startSession('AIR_RIFLE_10M');
        } catch (err) {
          thrownError = err as Error;
        }
      });

      // Error instances are thrown as-is
      expect(thrownError?.message).toBe('Unexpected error');
      expect(result.current.error?.message).toBe('Unexpected error');
      expect(result.current.isStarting).toBe(false);
    });
  });

  describe('switchMode', () => {
    beforeEach(async () => {
      // Set up session started state before each test
      mockStartSession.mockResolvedValue({ sessionId: 'session-123' });

      const { result, unmount } = renderHook(() => useSession());
      await act(async () => {
        await result.current.startSession('AIR_RIFLE_10M');
      });
      unmount();
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

      expect(result.current.isSwitching).toBe(false);
      expect(result.current.error).toBeNull();

      // Verify store is updated
      const storeState = useSessionStore.getState();
      expect(storeState.mode).toBe('MATCH');
    });

    it('isSwitching is true while switching mode', async () => {
      let resolveSwitchMode: (value: void) => void;
      const switchModePromise = new Promise<void>((resolve) => {
        resolveSwitchMode = resolve;
      });

      mockSwitchMode.mockReturnValue(switchModePromise);

      const { result } = renderHook(() => useSession());

      act(() => {
        result.current.switchMode('MATCH');
      });

      expect(result.current.isSwitching).toBe(true);

      await act(async () => {
        resolveSwitchMode!(undefined);
        await switchModePromise;
      });

      expect(result.current.isSwitching).toBe(false);
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
      expect(result.current.error?.message).toBe('Session has not been started');
      expect(result.current.isSwitching).toBe(false);
    });

    it('sets error state on mode switch error', async () => {
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
      expect(result.current.error?.message).toBe('Failed to switch mode');
      expect(result.current.isSwitching).toBe(false);

      // Verify store is not changed
      const storeState = useSessionStore.getState();
      expect(storeState.mode).toBe('SIGHTING');
    });

    it('catches exceptions during mode switch and sets error state', async () => {
      mockSwitchMode.mockRejectedValue(new Error('Unexpected error'));

      const { result } = renderHook(() => useSession());

      let thrownError: Error | undefined;
      await act(async () => {
        try {
          await result.current.switchMode('MATCH');
        } catch (err) {
          thrownError = err as Error;
        }
      });

      // Error instances are thrown as-is
      expect(thrownError?.message).toBe('Unexpected error');
      expect(result.current.error?.message).toBe('Unexpected error');
      expect(result.current.isSwitching).toBe(false);
    });
  });

  describe('resetSession', () => {
    beforeEach(async () => {
      // Set up session started state before each test
      mockStartSession.mockResolvedValue({ sessionId: 'session-123' });

      const { result, unmount } = renderHook(() => useSession());
      await act(async () => {
        await result.current.startSession('AIR_RIFLE_10M');
      });
      unmount();
    });

    it('succeeds in resetting session', async () => {
      mockResetSession.mockResolvedValue(undefined);

      const { result } = renderHook(() => useSession());

      await act(async () => {
        await result.current.resetSession();
      });

      expect(mockResetSession).toHaveBeenCalledWith({
        sessionId: 'session-123',
      });

      expect(result.current.isResetting).toBe(false);
      expect(result.current.error).toBeNull();

      // Verify store is reset
      const storeState = useSessionStore.getState();
      expect(storeState.currentSessionId).toBeNull();
      expect(storeState.mode).toBe('SIGHTING');
      expect(storeState.shots).toEqual([]);
      expect(storeState.totalScore).toBe(0);
      expect(storeState.seriesScores).toEqual([]);
    });

    it('isResetting is true while resetting', async () => {
      let resolveReset: (value: void) => void;
      const resetPromise = new Promise<void>((resolve) => {
        resolveReset = resolve;
      });

      mockResetSession.mockReturnValue(resetPromise);

      const { result } = renderHook(() => useSession());

      act(() => {
        result.current.resetSession();
      });

      expect(result.current.isResetting).toBe(true);

      await act(async () => {
        resolveReset!(undefined);
        await resetPromise;
      });

      expect(result.current.isResetting).toBe(false);
    });

    it('throws an error when session has not been started', async () => {
      // Reset store to session-not-started state
      const { resetSession } = useSessionStore.getState();
      resetSession();

      const { result } = renderHook(() => useSession());

      let thrownError: Error | undefined;
      await act(async () => {
        try {
          await result.current.resetSession();
        } catch (err) {
          thrownError = err as Error;
        }
      });

      expect(thrownError?.message).toBe('Session has not been started');
      expect(result.current.error?.message).toBe('Session has not been started');
      expect(result.current.isResetting).toBe(false);
    });

    it('sets error state on reset error', async () => {
      mockResetSession.mockRejectedValue(new ServiceError('Failed to reset session', 'RESET_SESSION_FAILED'));

      const { result } = renderHook(() => useSession());

      let thrownError: Error | undefined;
      await act(async () => {
        try {
          await result.current.resetSession();
        } catch (err) {
          thrownError = err as Error;
        }
      });

      expect(thrownError?.message).toBe('Failed to reset session');
      expect(result.current.error?.message).toBe('Failed to reset session');
      expect(result.current.isResetting).toBe(false);

      // Verify store is not changed
      const storeState = useSessionStore.getState();
      expect(storeState.currentSessionId).toBe('session-123');
    });

    it('catches exceptions during reset and sets error state', async () => {
      mockResetSession.mockRejectedValue(new Error('Unexpected error'));

      const { result } = renderHook(() => useSession());

      let thrownError: Error | undefined;
      await act(async () => {
        try {
          await result.current.resetSession();
        } catch (err) {
          thrownError = err as Error;
        }
      });

      // Error instances are thrown as-is
      expect(thrownError?.message).toBe('Unexpected error');
      expect(result.current.error?.message).toBe('Unexpected error');
      expect(result.current.isResetting).toBe(false);
    });
  });

  describe('integration scenarios', () => {
    it('full scenario: start session → switch mode → reset works correctly', async () => {
      mockStartSession.mockResolvedValue({ sessionId: 'session-789' });
      mockSwitchMode.mockResolvedValue(undefined);
      mockResetSession.mockResolvedValue(undefined);

      const { result } = renderHook(() => useSession());

      // Verify initial state
      expect(result.current.currentSessionId).toBeNull();
      expect(result.current.mode).toBe('SIGHTING');

      // Start session
      await act(async () => {
        await result.current.startSession('AIR_RIFLE_10M');
      });

      expect(result.current.currentSessionId).toBe('session-789');
      expect(result.current.mode).toBe('SIGHTING');

      // Switch mode
      await act(async () => {
        await result.current.switchMode('MATCH');
      });

      expect(result.current.mode).toBe('MATCH');

      // Reset session
      await act(async () => {
        await result.current.resetSession();
      });

      expect(result.current.currentSessionId).toBeNull();
      expect(result.current.mode).toBe('SIGHTING');
      expect(result.current.totalScore).toBe(0);
      expect(result.current.seriesScores).toEqual([]);
    });

    it('can retry after an error occurs', async () => {
      mockStartSession
        .mockRejectedValueOnce(new ServiceError('Failed to start session', 'SESSION_START_FAILED'))
        .mockResolvedValueOnce({ sessionId: 'session-retry' });

      const { result } = renderHook(() => useSession());

      // First session start fails
      let thrownError: Error | undefined;
      await act(async () => {
        try {
          await result.current.startSession('AIR_RIFLE_10M');
        } catch (err) {
          thrownError = err as Error;
        }
      });

      expect(thrownError?.message).toBe('Failed to start session');
      expect(result.current.error?.message).toBe('Failed to start session');
      expect(result.current.currentSessionId).toBeNull();

      // Retry succeeds
      await act(async () => {
        await result.current.startSession('AIR_RIFLE_10M');
      });

      expect(result.current.error).toBeNull();
      expect(result.current.currentSessionId).toBe('session-retry');
    });
  });
});
