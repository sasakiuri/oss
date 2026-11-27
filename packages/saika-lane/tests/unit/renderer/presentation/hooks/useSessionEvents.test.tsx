// SPDX-License-Identifier: MIT
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useSessionEvents } from '@/renderer/presentation/hooks/useSessionEvents';
import { useSessionStore } from '@/renderer/presentation/stores/sessionStore';

import { emit, installMockElectronAPI, type MockedElectronAPI } from '../../../../helpers/mockElectronAPI';

describe('useSessionEvents', () => {
  let api: MockedElectronAPI;

  beforeEach(() => {
    useSessionStore.getState().resetSession();
    useSessionStore.getState().setLaneNumber(1);
    api = installMockElectronAPI();
  });

  describe('subscription registration', () => {
    it('subscribes to 3 events on mount', () => {
      renderHook(() => useSessionEvents());

      expect(api.on.sessionStarted).toHaveBeenCalledTimes(1);
      expect(api.on.modeSwitched).toHaveBeenCalledTimes(1);
      expect(api.on.sessionReset).toHaveBeenCalledTimes(1);
    });

    it('unsubscribes from all on unmount', () => {
      const unsubStarted = vi.fn();
      const unsubSwitched = vi.fn();
      const unsubReset = vi.fn();

      api.on.sessionStarted.mockReturnValue(unsubStarted);
      api.on.modeSwitched.mockReturnValue(unsubSwitched);
      api.on.sessionReset.mockReturnValue(unsubReset);

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

      emit('sessionStarted', { sessionId: 'sess-123', discipline: 'AIR_RIFLE_10M' });

      const state = useSessionStore.getState();
      expect(state.currentSessionId).toBe('sess-123');
      expect(state.mode).toBe('SIGHTING');
    });

    it('preserves restored laneNumber when a new session starts', () => {
      useSessionStore.getState().setLaneNumber(6);
      renderHook(() => useSessionEvents());

      emit('sessionStarted', { sessionId: 'sess-123', discipline: 'AIR_RIFLE_10M' });

      expect(useSessionStore.getState().laneNumber).toBe(6);
    });
  });

  describe('modeSwitched', () => {
    it('switches the mode', () => {
      renderHook(() => useSessionEvents());

      emit('modeSwitched', { sessionId: 'sess-123', mode: 'MATCH' });

      expect(useSessionStore.getState().mode).toBe('MATCH');
    });
  });

  describe('sessionReset', () => {
    it('clears shooting data while preserving session context', () => {
      useSessionStore.getState().setSessionId('sess-123');
      useSessionStore.getState().setMode('MATCH');
      useSessionStore.getState().setDiscipline('AIR_RIFLE_10M');
      useSessionStore.getState().updateScores(105, [105]);

      renderHook(() => useSessionEvents());

      emit('sessionReset', { sessionId: 'sess-123' });

      const state = useSessionStore.getState();
      expect(state.currentSessionId).toBe('sess-123');
      expect(state.mode).toBe('MATCH');
      expect(state.discipline).toBe('AIR_RIFLE_10M');
      expect(state.shots).toEqual([]);
      expect(state.totalScore).toBe(0);
      expect(state.seriesScores).toEqual([]);
    });
  });
});
