// SPDX-License-Identifier: MIT
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSessionEvents } from '@/renderer/presentation/hooks/useSessionEvents';
import { useSessionStore } from '@/renderer/presentation/stores/sessionStore';
import type {
  ModeSwitchedEventPayload,
  SessionResetEventPayload,
  SessionStartedEventPayload,
} from '@/shared/ipc/contracts';

const mockOnSessionStarted = vi.fn();
const mockOnModeSwitched = vi.fn();
const mockOnSessionReset = vi.fn();

describe('useSessionEvents', () => {
  beforeEach(() => {
    useSessionStore.getState().resetSession();
    vi.clearAllMocks();

    mockOnSessionStarted.mockReturnValue(vi.fn());
    mockOnModeSwitched.mockReturnValue(vi.fn());
    mockOnSessionReset.mockReturnValue(vi.fn());

    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      writable: true,
      value: {
        on: {
          sessionStarted: mockOnSessionStarted,
          modeSwitched: mockOnModeSwitched,
          sessionReset: mockOnSessionReset,
        },
      },
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(window, 'electronAPI');
  });

  describe('subscription registration', () => {
    it('subscribes to 3 events on mount', () => {
      renderHook(() => useSessionEvents());

      expect(mockOnSessionStarted).toHaveBeenCalledTimes(1);
      expect(mockOnModeSwitched).toHaveBeenCalledTimes(1);
      expect(mockOnSessionReset).toHaveBeenCalledTimes(1);
    });

    it('unsubscribes from all on unmount', () => {
      const unsubStarted = vi.fn();
      const unsubSwitched = vi.fn();
      const unsubReset = vi.fn();

      mockOnSessionStarted.mockReturnValue(unsubStarted);
      mockOnModeSwitched.mockReturnValue(unsubSwitched);
      mockOnSessionReset.mockReturnValue(unsubReset);

      const { unmount } = renderHook(() => useSessionEvents());
      unmount();

      expect(unsubStarted).toHaveBeenCalledTimes(1);
      expect(unsubSwitched).toHaveBeenCalledTimes(1);
      expect(unsubReset).toHaveBeenCalledTimes(1);
    });
  });

  describe('sessionStarted', () => {
    it('sets session ID and transitions to sighting mode', () => {
      renderHook(() => useSessionEvents());

      const callback = mockOnSessionStarted.mock.calls[0]![0] as (event: SessionStartedEventPayload) => void;

      callback({ sessionId: 'sess-123', discipline: 'AIR_RIFLE_10M' });

      const state = useSessionStore.getState();
      expect(state.currentSessionId).toBe('sess-123');
      expect(state.mode).toBe('SIGHTING');
    });
  });

  describe('modeSwitched', () => {
    it('switches the mode', () => {
      renderHook(() => useSessionEvents());

      const callback = mockOnModeSwitched.mock.calls[0]![0] as (event: ModeSwitchedEventPayload) => void;

      callback({ sessionId: 'sess-123', mode: 'MATCH' });

      expect(useSessionStore.getState().mode).toBe('MATCH');
    });
  });

  describe('sessionReset', () => {
    it('resets session state', () => {
      useSessionStore.getState().setSessionId('sess-123');
      useSessionStore.getState().setMode('MATCH');

      renderHook(() => useSessionEvents());

      const callback = mockOnSessionReset.mock.calls[0]![0] as (event: SessionResetEventPayload) => void;

      callback({ sessionId: 'sess-123' });

      const state = useSessionStore.getState();
      expect(state.currentSessionId).toBeNull();
      expect(state.mode).toBe('SIGHTING');
      expect(state.shots).toEqual([]);
    });
  });
});
