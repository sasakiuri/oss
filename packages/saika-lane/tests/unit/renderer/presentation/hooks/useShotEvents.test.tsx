// SPDX-License-Identifier: MIT
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { _resetAudioPlaybackForTest } from '@/renderer/presentation/hooks/useAudioPlayback';
import { useShotEvents } from '@/renderer/presentation/hooks/useShotEvents';
import { useCompetitionStore } from '@/renderer/presentation/stores/competitionStore';
import { useSessionStore } from '@/renderer/presentation/stores/sessionStore';

import { emit, installMockElectronAPI, type MockedElectronAPI } from '../../../../helpers/mockElectronAPI';
import { stubShotAudio } from '../../../../helpers/shotAudio';

// Mock shot sound asset
vi.mock('@/assets/sounds/shot.wav', () => ({
  default: 'mock-shot-sound.wav',
}));

describe('useShotEvents', () => {
  let api: MockedElectronAPI;
  let audio: ReturnType<typeof stubShotAudio>;

  beforeEach(() => {
    _resetAudioPlaybackForTest();
    useSessionStore.getState().resetSession();
    api = installMockElectronAPI();
    audio = stubShotAudio();
  });

  afterEach(() => {
    _resetAudioPlaybackForTest();
    vi.unstubAllGlobals();
  });

  it('shows a commanded reset only for the current session and persists progress errors', () => {
    useSessionStore.getState().setSessionId('session');
    renderHook(() => useShotEvents());
    act(() => emit('positionExtraNullified', { sessionId: 'other', competitionId: 'comp' }));
    expect(useSessionStore.getState().nullificationMessage).toBeNull();
    act(() => emit('positionExtraNullified', { sessionId: 'session', competitionId: 'comp' }));
    expect(useSessionStore.getState().nullificationMessage).toBe('Extra shot nullified. Target reset to Sighting.');
    act(() =>
      emit('error', {
        code: 'SHOT_PROGRESS_FAILED',
        userMessage: 'The shot was saved, but competition progress failed. Contact a Range Officer.',
        message: 'Progress failed',
        severity: 'error',
      }),
    );
    expect(useSessionStore.getState().recordingError).toContain('Contact a Range Officer');
  });

  it('shows a reset failure without claiming Sighting success, then clears it after a successful reset', () => {
    useSessionStore.getState().setSessionId('session');
    renderHook(() => useShotEvents());
    act(() =>
      emit('positionExtraNullified', {
        sessionId: 'session',
        competitionId: 'comp',
        resetError: 'The Sighting reset failed.',
      }),
    );
    expect(useSessionStore.getState().targetResetError).toBe('The Sighting reset failed.');
    expect(useSessionStore.getState().nullificationMessage).toBeNull();
    act(() => emit('positionExtraNullified', { sessionId: 'session', competitionId: 'comp' }));
    expect(useSessionStore.getState().targetResetError).toBeNull();
    expect(useSessionStore.getState().nullificationMessage).toContain('Target reset to Sighting.');
  });

  it('clears the reset notice only on progress from the current competition', () => {
    useCompetitionStore.setState({ competitionId: 'comp' });
    useSessionStore.setState({ nullificationMessage: 'Extra shot nullified. Target reset to Sighting.' });
    renderHook(() => useShotEvents());
    act(() =>
      emit('competitionProgressChanged', { competitionId: 'other', stageIndex: 1, seriesIndex: 2, shotCount: 1 }),
    );
    expect(useSessionStore.getState().nullificationMessage).not.toBeNull();
    act(() =>
      emit('competitionProgressChanged', { competitionId: 'comp', stageIndex: 1, seriesIndex: 2, shotCount: 1 }),
    );
    expect(useSessionStore.getState().nullificationMessage).toBeNull();
  });

  describe('subscription registration', () => {
    it('subscribes to shotRecorded and shotReceived on mount', () => {
      renderHook(() => useShotEvents());

      expect(api.on.shotRecorded).toHaveBeenCalledTimes(1);
      expect(api.on.shotReceived).toHaveBeenCalledTimes(1);
    });

    it('unsubscribes from both on unmount', () => {
      const unsubRecorded = vi.fn();
      const unsubReceived = vi.fn();
      api.on.shotRecorded.mockReturnValue(unsubRecorded);
      api.on.shotReceived.mockReturnValue(unsubReceived);

      const { unmount } = renderHook(() => useShotEvents());
      unmount();

      expect(unsubRecorded).toHaveBeenCalledTimes(1);
      expect(unsubReceived).toHaveBeenCalledTimes(1);
    });
  });

  describe('shotReceived callback (low-latency audio playback)', () => {
    it('plays shot sound for MT201 device', async () => {
      useSessionStore.getState().setDeviceId('MT201');

      renderHook(() => useShotEvents());
      await audio.flushAudioLoad();

      audio.start.mockClear();

      emit('shotReceived', {});

      expect(audio.start).toHaveBeenCalledTimes(1);
    });

    it.each(['BPT216', 'BPT216_RS232'])('plays shot sound on shotReceived for BPT-216 profile %s', async (deviceId) => {
      useSessionStore.getState().setDeviceId(deviceId);

      renderHook(() => useShotEvents());
      await audio.flushAudioLoad();

      audio.start.mockClear();

      emit('shotReceived', {});

      expect(audio.start).toHaveBeenCalledTimes(1);
    });

    it('does not play shot sound for unsupported devices', async () => {
      useSessionStore.getState().setDeviceId('HS10');

      renderHook(() => useShotEvents());
      await audio.flushAudioLoad();

      audio.start.mockClear();

      emit('shotReceived', {});

      expect(audio.start).not.toHaveBeenCalled();
    });
  });

  describe('shotRecorded callback (data processing)', () => {
    it('adds shot to the store', () => {
      renderHook(() => useShotEvents());

      emit('shotRecorded', {
        sessionId: 'sess-1',
        shot: {
          id: 'shot-1',
          shotNumber: 1,
          x: 0.5,
          y: -0.3,
          score: 10.2,
          timestamp: '2026-02-15T10:00:00Z',
          mode: 'MATCH',
          isRecorded: true,
          innerTen: false,
        },
      });

      const state = useSessionStore.getState();
      expect(state.shots).toHaveLength(1);
      expect(state.shots[0]?.id).toBe('shot-1');
    });

    it('does not play shot sound on shotRecorded', async () => {
      useSessionStore.getState().setDeviceId('MT201');

      renderHook(() => useShotEvents());
      await audio.flushAudioLoad();

      audio.start.mockClear();

      emit('shotRecorded', {
        sessionId: 'sess-1',
        shot: {
          id: 'shot-1',
          shotNumber: 1,
          x: 0,
          y: 0,
          score: 10.9,
          timestamp: '2026-02-15T10:00:00Z',
          mode: 'MATCH',
          isRecorded: true,
          innerTen: false,
        },
      });

      expect(audio.start).not.toHaveBeenCalled();
    });
  });
});
