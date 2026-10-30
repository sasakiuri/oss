// SPDX-License-Identifier: MIT
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { _resetAudioPlaybackForTest } from '@/renderer/presentation/hooks/useAudioPlayback';
import { useShotEvents } from '@/renderer/presentation/hooks/useShotEvents';
import { useCompetitionStore } from '@/renderer/presentation/stores/competitionStore';
import { useSessionStore } from '@/renderer/presentation/stores/sessionStore';
import type { ShotRecordedEventPayload } from '@/shared/ipc/contracts';

// Mock shot sound asset
vi.mock('@/assets/sounds/shot.wav', () => ({
  default: 'mock-shot-sound.wav',
}));

// AudioContext mock (useAudioPlayback uses Web Audio API)
const mockStart = vi.fn();
const fakeBuffer = { duration: 1 } as AudioBuffer;
const mockDecodeAudioData = vi.fn().mockResolvedValue(fakeBuffer);

function createMockAudioContext() {
  return {
    state: 'running',
    resume: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    destination: {},
    createBufferSource: vi.fn(() => ({
      buffer: null as AudioBuffer | null,
      connect: vi.fn(),
      start: mockStart,
    })),
    createGain: vi.fn(() => ({
      gain: { value: 1 },
      connect: vi.fn(),
    })),
    decodeAudioData: mockDecodeAudioData,
  };
}

const MockAudioContext = vi.fn().mockImplementation(function () {
  return createMockAudioContext();
});

const mockFetch = vi.fn().mockResolvedValue({
  arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
});

/** Wait for fetch → arrayBuffer → decodeAudioData → bufferRef chain to complete */
async function flushAudioLoad() {
  await vi.waitFor(() => {
    expect(mockDecodeAudioData).toHaveBeenCalled();
  });
  // Flush the final .then that sets bufferRef.current
  await act(async () => {
    await Promise.resolve();
  });
}

const mockOnShotRecorded = vi.fn();
const mockOnShotReceived = vi.fn();

describe('useShotEvents', () => {
  beforeEach(() => {
    _resetAudioPlaybackForTest();
    useSessionStore.getState().resetSession();
    vi.clearAllMocks();

    mockOnShotRecorded.mockReturnValue(vi.fn());
    mockOnShotReceived.mockReturnValue(vi.fn());

    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      writable: true,
      value: {
        on: {
          shotRecorded: mockOnShotRecorded,
          shotReceived: mockOnShotReceived,
          competitionProgressChanged: vi.fn(() => vi.fn()),
          positionExtraNullified: vi.fn(() => vi.fn()),
          error: vi.fn(() => vi.fn()),
        },
      },
    });

    vi.stubGlobal('AudioContext', MockAudioContext);
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    _resetAudioPlaybackForTest();
    Reflect.deleteProperty(window, 'electronAPI');
    vi.unstubAllGlobals();
  });

  it('shows a commanded reset only for the current session and persists progress errors', () => {
    useSessionStore.getState().setSessionId('session');
    renderHook(() => useShotEvents());
    const nullified = vi.mocked(window.electronAPI.on.positionExtraNullified).mock.calls[0]![0];
    act(() => nullified({ sessionId: 'other', competitionId: 'comp' }));
    expect(useSessionStore.getState().nullificationMessage).toBeNull();
    act(() => nullified({ sessionId: 'session', competitionId: 'comp' }));
    expect(useSessionStore.getState().nullificationMessage).toBe('Extra shot nullified. Target reset to Sighting.');
    act(() =>
      vi.mocked(window.electronAPI.on.error).mock.calls[0]![0]({
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
    const notify = vi.mocked(window.electronAPI.on.positionExtraNullified).mock.calls[0]![0];
    act(() => notify({ sessionId: 'session', competitionId: 'comp', resetError: 'The Sighting reset failed.' }));
    expect(useSessionStore.getState().targetResetError).toBe('The Sighting reset failed.');
    expect(useSessionStore.getState().nullificationMessage).toBeNull();
    act(() => notify({ sessionId: 'session', competitionId: 'comp' }));
    expect(useSessionStore.getState().targetResetError).toBeNull();
    expect(useSessionStore.getState().nullificationMessage).toContain('Target reset to Sighting.');
  });

  it('clears the reset notice only on progress from the current competition', () => {
    useCompetitionStore.setState({ competitionId: 'comp' });
    useSessionStore.setState({ nullificationMessage: 'Extra shot nullified. Target reset to Sighting.' });
    renderHook(() => useShotEvents());
    const progress = vi.mocked(window.electronAPI.on.competitionProgressChanged).mock.calls[0]![0];
    act(() => progress({ competitionId: 'other', stageIndex: 1, seriesIndex: 2, shotCount: 1 }));
    expect(useSessionStore.getState().nullificationMessage).not.toBeNull();
    act(() => progress({ competitionId: 'comp', stageIndex: 1, seriesIndex: 2, shotCount: 1 }));
    expect(useSessionStore.getState().nullificationMessage).toBeNull();
  });

  describe('subscription registration', () => {
    it('subscribes to shotRecorded and shotReceived on mount', () => {
      renderHook(() => useShotEvents());

      expect(mockOnShotRecorded).toHaveBeenCalledTimes(1);
      expect(mockOnShotReceived).toHaveBeenCalledTimes(1);
    });

    it('unsubscribes from both on unmount', () => {
      const unsubRecorded = vi.fn();
      const unsubReceived = vi.fn();
      mockOnShotRecorded.mockReturnValue(unsubRecorded);
      mockOnShotReceived.mockReturnValue(unsubReceived);

      const { unmount } = renderHook(() => useShotEvents());
      unmount();

      expect(unsubRecorded).toHaveBeenCalledTimes(1);
      expect(unsubReceived).toHaveBeenCalledTimes(1);
    });
  });

  describe('shotReceived callback (low-latency audio playback)', () => {
    it('plays shot sound for MT201 device', async () => {
      useSessionStore.getState().setDeviceInfo('KOHTO', 'MT201');

      renderHook(() => useShotEvents());
      await flushAudioLoad();

      mockStart.mockClear();

      const callback = mockOnShotReceived.mock.calls[0]![0] as () => void;
      callback();

      expect(mockStart).toHaveBeenCalledTimes(1);
    });

    it.each(['BPT216', 'BPT216_RS232'])('plays shot sound on shotReceived for BPT-216 profile %s', async (deviceId) => {
      useSessionStore.getState().setDeviceInfo('KOHTO', deviceId);

      renderHook(() => useShotEvents());
      await flushAudioLoad();

      mockStart.mockClear();

      const callback = mockOnShotReceived.mock.calls[0]![0] as () => void;
      callback();

      expect(mockStart).toHaveBeenCalledTimes(1);
    });

    it('does not play shot sound for unsupported devices', async () => {
      useSessionStore.getState().setDeviceInfo('SIUS', 'HS10');

      renderHook(() => useShotEvents());
      await flushAudioLoad();

      mockStart.mockClear();

      const callback = mockOnShotReceived.mock.calls[0]![0] as () => void;
      callback();

      expect(mockStart).not.toHaveBeenCalled();
    });
  });

  describe('shotRecorded callback (data processing)', () => {
    it('adds shot to the store', () => {
      renderHook(() => useShotEvents());

      const callback = mockOnShotRecorded.mock.calls[0]![0] as (event: ShotRecordedEventPayload) => void;

      callback({
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
      useSessionStore.getState().setDeviceInfo('KOHTO', 'MT201');

      renderHook(() => useShotEvents());
      await flushAudioLoad();

      mockStart.mockClear();

      const callback = mockOnShotRecorded.mock.calls[0]![0] as (event: ShotRecordedEventPayload) => void;

      callback({
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

      expect(mockStart).not.toHaveBeenCalled();
    });
  });
});
