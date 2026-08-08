// SPDX-License-Identifier: MIT
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { _resetAudioPlaybackForTest, useAudioPlayback } from '@/renderer/presentation/hooks/useAudioPlayback';
import { useSessionStore } from '@/renderer/presentation/stores/sessionStore';

vi.mock('@/assets/sounds/shot.wav', () => ({
  default: 'mock-shot-sound.wav',
}));

const mockStart = vi.fn();
const mockStop = vi.fn();
const mockResume = vi.fn().mockResolvedValue(undefined);
const mockClose = vi.fn().mockResolvedValue(undefined);

let capturedGainValue: number | undefined;

function createMockGainNode() {
  return {
    gain: {
      get value() {
        return capturedGainValue ?? 1;
      },
      set value(v: number) {
        capturedGainValue = v;
      },
    },
    connect: vi.fn(),
  };
}

const fakeBuffer = { duration: 1 } as AudioBuffer;

let mockCtxState = 'running';
let mockDecodeResolve: ((buf: AudioBuffer) => void) | null = null;

function createMockAudioContext() {
  let decodePromise: Promise<AudioBuffer>;
  const decodeData = vi.fn().mockImplementation(() => {
    decodePromise = new Promise<AudioBuffer>((resolve) => {
      mockDecodeResolve = resolve;
    });
    return decodePromise;
  });

  const ctx = {
    get state() {
      return mockCtxState;
    },
    sampleRate: 44100,
    resume: mockResume,
    close: mockClose,
    destination: {},
    createBuffer: vi.fn(() => ({ duration: 0, length: 1, sampleRate: 44100 }) as unknown as AudioBuffer),
    createBufferSource: vi.fn(() => ({
      buffer: null as AudioBuffer | null,
      connect: vi.fn(),
      start: mockStart,
      stop: mockStop,
      onended: null as (() => void) | null,
    })),
    createGain: vi.fn(() => createMockGainNode()),
    decodeAudioData: decodeData,
  };
  return ctx;
}

let mockCtxInstance: ReturnType<typeof createMockAudioContext>;

const MockAudioContext = vi.fn().mockImplementation(() => {
  mockCtxInstance = createMockAudioContext();
  return mockCtxInstance;
});

const mockFetch = vi.fn().mockResolvedValue({
  arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
});

/** Resolve decodeAudioData, flush all microtasks, and clear warmup call counts */
async function flushAudioLoad() {
  // Wait for fetch chain to reach decodeAudioData
  await waitFor(() => {
    expect(mockDecodeResolve).not.toBeNull();
  });
  // Resolve decodeAudioData with fakeBuffer (triggers warmup silent buffer)
  await act(async () => {
    mockDecodeResolve!(fakeBuffer);
  });
  // Clear call counts so warmup's createBufferSource/start don't affect test assertions
  mockStart.mockClear();
  mockStop.mockClear();
  mockCtxInstance.createBufferSource.mockClear();
  mockCtxInstance.createGain.mockClear();
}

describe('useAudioPlayback', () => {
  beforeEach(() => {
    _resetAudioPlaybackForTest();
    useSessionStore.setState({ deviceId: null, audioVolume: 50 });
    vi.clearAllMocks();
    capturedGainValue = undefined;
    mockCtxState = 'running';
    mockDecodeResolve = null;
    vi.stubGlobal('AudioContext', MockAudioContext);
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('initialization', () => {
    it('creates AudioContext and fetches/decodes mp3 on mount', async () => {
      renderHook(() => useAudioPlayback());
      await flushAudioLoad();

      expect(MockAudioContext).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith('mock-shot-sound.wav');
      expect(mockCtxInstance.decodeAudioData).toHaveBeenCalledTimes(1);
    });

    it('plays a silent buffer to warm up the audio pipeline after decoding', async () => {
      renderHook(() => useAudioPlayback());

      // Manually resolve before flushAudioLoad to verify warmup calls
      await waitFor(() => {
        expect(mockDecodeResolve).not.toBeNull();
      });
      await act(async () => {
        mockDecodeResolve!(fakeBuffer);
      });

      // Warmup calls createBufferSource + start once each
      expect(mockCtxInstance.createBufferSource).toHaveBeenCalledTimes(1);
      expect(mockStart).toHaveBeenCalledTimes(1);
      // GainNode is not used (not needed for silent buffer)
      expect(mockCtxInstance.createGain).not.toHaveBeenCalled();

      // Warmup source buffer is a 1-sample silent buffer
      const warmupSource = mockCtxInstance.createBufferSource.mock.results[0]?.value;
      expect(warmupSource.buffer).not.toBeNull();
      expect(warmupSource.connect).toHaveBeenCalledWith(mockCtxInstance.destination);
    });

    it('does not close the singleton AudioContext on unmount (persists for app lifetime)', async () => {
      const { unmount } = renderHook(() => useAudioPlayback());
      await flushAudioLoad();

      unmount();

      expect(mockClose).not.toHaveBeenCalled();
    });

    it('shares a single AudioContext across multiple hook instances', async () => {
      renderHook(() => useAudioPlayback());
      renderHook(() => useAudioPlayback());
      await flushAudioLoad();

      // Only one AudioContext should be created despite two hook instances
      expect(MockAudioContext).toHaveBeenCalledTimes(1);
    });
  });

  describe('playShotSound', () => {
    it('plays via BufferSource + GainNode for MT201 device', async () => {
      useSessionStore.getState().setDeviceInfo('KOHTO', 'MT201');

      const { result } = renderHook(() => useAudioPlayback());
      await flushAudioLoad();

      await act(async () => {
        result.current.playShotSound();
      });

      expect(mockCtxInstance.createBufferSource).toHaveBeenCalledTimes(1);
      expect(mockCtxInstance.createGain).toHaveBeenCalledTimes(1);
      expect(mockStart).toHaveBeenCalledTimes(1);
    });

    it('plays the same shot sound for the DISAG RedDot rifle', async () => {
      useSessionStore.getState().setDeviceInfo('DISAG', 'DISAG_KT_RDT_ZIE_1_RIFLE');

      const { result } = renderHook(() => useAudioPlayback());
      await flushAudioLoad();

      await act(async () => {
        result.current.playShotSound();
      });

      expect(mockCtxInstance.createBufferSource).toHaveBeenCalledTimes(1);
      expect(mockCtxInstance.createGain).toHaveBeenCalledTimes(1);
      expect(mockStart).toHaveBeenCalledTimes(1);
      expect(capturedGainValue).toBe(0.5);
    });

    it('does not play sound for unsupported devices', async () => {
      useSessionStore.getState().setDeviceInfo('SIUS', 'HS10');

      const { result } = renderHook(() => useAudioPlayback());
      await flushAudioLoad();

      await act(async () => {
        result.current.playShotSound();
      });

      expect(mockStart).not.toHaveBeenCalled();
    });

    it('does not play sound when deviceId is not set', async () => {
      const { result } = renderHook(() => useAudioPlayback());
      await flushAudioLoad();

      await act(async () => {
        result.current.playShotSound();
      });

      expect(mockStart).not.toHaveBeenCalled();
    });

    it('sets GainNode gain.value based on store audioVolume (default 50 -> 0.5)', async () => {
      useSessionStore.getState().setDeviceInfo('KOHTO', 'MT201');

      const { result } = renderHook(() => useAudioPlayback());
      await flushAudioLoad();

      await act(async () => {
        result.current.playShotSound();
      });

      expect(capturedGainValue).toBe(0.5);
    });

    it('sets gain.value to 0.8 when audioVolume is 80', async () => {
      useSessionStore.getState().setDeviceInfo('KOHTO', 'MT201');
      useSessionStore.getState().setAudioVolume(80);

      const { result } = renderHook(() => useAudioPlayback());
      await flushAudioLoad();

      await act(async () => {
        result.current.playShotSound();
      });

      expect(capturedGainValue).toBe(0.8);
    });

    it('does not play when audioVolume is 0 (muted)', async () => {
      useSessionStore.getState().setDeviceInfo('KOHTO', 'MT201');
      useSessionStore.getState().setAudioVolume(0);

      const { result } = renderHook(() => useAudioPlayback());
      await flushAudioLoad();

      await act(async () => {
        result.current.playShotSound();
      });

      expect(mockStart).not.toHaveBeenCalled();
    });

    it('sets gain.value to 1 when audioVolume is 100 (maximum)', async () => {
      useSessionStore.getState().setDeviceInfo('KOHTO', 'MT201');
      useSessionStore.getState().setAudioVolume(100);

      const { result } = renderHook(() => useAudioPlayback());
      await flushAudioLoad();

      await act(async () => {
        result.current.playShotSound();
      });

      expect(capturedGainValue).toBe(1);
    });

    it('calls resume() before playback when AudioContext is suspended', async () => {
      useSessionStore.getState().setDeviceInfo('KOHTO', 'MT201');
      mockCtxState = 'suspended';

      const { result } = renderHook(() => useAudioPlayback());
      await flushAudioLoad();

      // Clear the resume call from initialization
      mockResume.mockClear();

      await act(async () => {
        result.current.playShotSound();
      });

      // playBuffer detects suspended state and calls resume before playing
      expect(mockResume).toHaveBeenCalledTimes(1);
      expect(mockStart).toHaveBeenCalledTimes(1);
    });

    it('plays even if resume() rejects (best-effort)', async () => {
      useSessionStore.getState().setDeviceInfo('KOHTO', 'MT201');
      mockCtxState = 'suspended';
      mockResume.mockRejectedValueOnce(new Error('resume failed'));

      const { result } = renderHook(() => useAudioPlayback());
      await flushAudioLoad();

      await act(async () => {
        result.current.playShotSound();
      });

      // Even though resume failed, playback is still attempted (best-effort)
      expect(mockStart).toHaveBeenCalledTimes(1);
    });

    it('does not play when AudioBuffer is not loaded', async () => {
      useSessionStore.getState().setDeviceInfo('KOHTO', 'MT201');

      const { result } = renderHook(() => useAudioPlayback());

      await act(async () => {
        result.current.playShotSound();
      });

      expect(mockStart).not.toHaveBeenCalled();
    });

    it('monophonic: stops the previous source on consecutive playback', async () => {
      useSessionStore.getState().setDeviceInfo('KOHTO', 'MT201');

      const { result } = renderHook(() => useAudioPlayback());
      await flushAudioLoad();

      await act(async () => {
        result.current.playShotSound();
      });
      expect(mockStart).toHaveBeenCalledTimes(1);

      await act(async () => {
        result.current.playShotSound();
      });
      expect(mockStop).toHaveBeenCalledTimes(1);
      expect(mockStart).toHaveBeenCalledTimes(2);
    });

    it('clears activeSource on onended so next playback does not call stop()', async () => {
      useSessionStore.getState().setDeviceInfo('KOHTO', 'MT201');

      const { result } = renderHook(() => useAudioPlayback());
      await flushAudioLoad();

      await act(async () => {
        result.current.playShotSound();
      });

      // Simulate onended
      const source = mockCtxInstance.createBufferSource.mock.results[0]?.value;
      act(() => {
        source.onended?.();
      });

      mockStop.mockClear();
      await act(async () => {
        result.current.playShotSound();
      });
      // Previous source already ended, so stop() should not be called
      expect(mockStop).not.toHaveBeenCalled();
    });
  });

  describe('playTestSound', () => {
    it('plays a test sound at the specified volume via GainNode', async () => {
      const { result } = renderHook(() => useAudioPlayback());
      await flushAudioLoad();

      await act(async () => {
        result.current.playTestSound(75);
      });

      expect(capturedGainValue).toBe(0.75);
      expect(mockStart).toHaveBeenCalledTimes(1);
    });

    it('does not play when volume is 0', async () => {
      const { result } = renderHook(() => useAudioPlayback());
      await flushAudioLoad();

      await act(async () => {
        result.current.playTestSound(0);
      });

      expect(mockStart).not.toHaveBeenCalled();
    });

    it('plays regardless of deviceId (no MT201 check)', async () => {
      useSessionStore.getState().setDeviceInfo('SIUS', 'HS10');

      const { result } = renderHook(() => useAudioPlayback());
      await flushAudioLoad();

      await act(async () => {
        result.current.playTestSound(50);
      });

      expect(mockStart).toHaveBeenCalledTimes(1);
      expect(capturedGainValue).toBe(0.5);
    });
  });
});
