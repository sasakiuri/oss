// SPDX-License-Identifier: MIT
import { act } from '@testing-library/react';
import { expect, vi } from 'vitest';

/**
 * Stubs the Web Audio API and fetch that useAudioPlayback loads and plays the shot sound with. `start` records
 * each played sound; `flushAudioLoad` waits until the sound is decoded and ready to play.
 */
export function stubShotAudio() {
  const start = vi.fn();
  const decodeAudioData = vi.fn().mockResolvedValue({ duration: 1 } as AudioBuffer);
  vi.stubGlobal(
    'AudioContext',
    vi.fn(function () {
      return {
        state: 'running',
        resume: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
        destination: {},
        createBufferSource: vi.fn(() => ({ buffer: null as AudioBuffer | null, connect: vi.fn(), start })),
        createGain: vi.fn(() => ({ gain: { value: 1 }, connect: vi.fn() })),
        decodeAudioData,
      };
    }),
  );
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)) }));

  return {
    start,
    /** Waits for fetch, arrayBuffer and decodeAudioData, then for the step that stores the decoded buffer. */
    async flushAudioLoad() {
      await vi.waitFor(() => {
        expect(decodeAudioData).toHaveBeenCalled();
      });
      await act(async () => {
        await Promise.resolve();
      });
    },
  };
}
