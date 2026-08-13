// SPDX-License-Identifier: MIT
import { useCallback, useEffect } from 'react';

import shotSound from '@/assets/sounds/shot.wav';
import { useSessionStore } from '@/renderer/presentation/stores/sessionStore';

const SHOT_SOUND_DEVICE_IDS = new Set(['MT201', 'DISAG_KT_RDT_ZIE_1_RIFLE', 'DISAG_KT_RDT_ZIE_1_PISTOL']);

// ---------------------------------------------------------------------------
// Module-level singleton state
// ---------------------------------------------------------------------------
// AudioContext and AudioBuffer are shared across all hook instances so that
// multiple call-sites (e.g. useShotEvents + SettingsModal) reuse a single
// context instead of creating duplicates.
// ---------------------------------------------------------------------------

let sharedCtx: AudioContext | null = null;
let sharedBuffer: AudioBuffer | null = null;
let sharedActiveSource: AudioBufferSourceNode | null = null;
let initialized = false;
let cleanupFn: (() => void) | null = null;

function ensureInitialized(): void {
  if (initialized) return;

  const ctx = new AudioContext({ latencyHint: 'interactive' });
  initialized = true;
  sharedCtx = ctx;

  // Immediately resume on app startup (attempt even before user gesture)
  void ctx.resume().catch(() => {});

  /** Play a silent buffer to pre-initialize the OS audio output stream */
  const warmup = () => {
    const src = ctx.createBufferSource();
    src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    src.connect(ctx.destination);
    src.start();
  };

  fetch(shotSound)
    .then((res) => res.arrayBuffer())
    .then((arrayBuffer) => ctx.decodeAudioData(arrayBuffer))
    .then((decoded) => {
      // Guard against stale closure after reset
      if (sharedCtx !== ctx) return;
      sharedBuffer = decoded;

      // Warm-up: play silent buffer to pre-initialize the OS audio output stream.
      // Wrapped in try-catch so a warmup failure does not propagate to the
      // .catch() handler (which handles fetch/decode failures only).
      try {
        warmup();
      } catch {
        /* non-critical: warmup failure after successful decode is not fatal */
      }
    })
    .catch(() => {
      // Teardown the failed instance and allow retry on next ensureInitialized().
      // Only reached when fetch/arrayBuffer/decodeAudioData itself fails.
      if (sharedCtx === ctx) {
        cleanupFn?.();
        cleanupFn = null;
        sharedCtx = null;
        initialized = false;
      }
    });

  // --- Ensure AudioContext resume via user gesture ---
  let gestureResolved = false;
  const onGesture = async () => {
    if (gestureResolved) return;
    try {
      await ctx.resume();
      warmup();
      gestureResolved = true;
      window.removeEventListener('pointerdown', onGesture);
      window.removeEventListener('keydown', onGesture);
    } catch {
      /* On resume failure, retry on next gesture */
    }
  };
  window.addEventListener('pointerdown', onGesture);
  window.addEventListener('keydown', onGesture);

  // --- On statechange: recover from suspended to running + re-warm-up ---
  ctx.onstatechange = () => {
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }
    if (ctx.state === 'running') {
      warmup();
    }
  };

  // --- Re-warm-up on visibilitychange ---
  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible' && ctx.state === 'running') {
      warmup();
    }
  };
  document.addEventListener('visibilitychange', onVisibilityChange);

  // Store cleanup for full teardown (test reset)
  cleanupFn = () => {
    window.removeEventListener('pointerdown', onGesture);
    window.removeEventListener('keydown', onGesture);
    ctx.onstatechange = null;
    document.removeEventListener('visibilitychange', onVisibilityChange);
    ctx.close();
  };
}

// ---------------------------------------------------------------------------
// Exported for testing — allows tests to reset singleton state between runs
// ---------------------------------------------------------------------------
export function _resetAudioPlaybackForTest(): void {
  cleanupFn?.();
  cleanupFn = null;
  sharedCtx = null;
  sharedBuffer = null;
  sharedActiveSource = null;
  initialized = false;
}

/**
 * Web Audio API based shot impact sound playback hook.
 *
 * On first mount, fetches WAV, decodes via decodeAudioData, and caches as AudioBuffer
 * in a module-level singleton. Subsequent mounts reuse the same AudioContext and buffer.
 * On playback, uses BufferSource + GainNode for immediate sound output.
 * Only plays impact sound for devices with a supported shot-sound profile.
 *
 * - AudioContext is created once with `latencyHint: 'interactive'` and immediately resumed
 * - After WAV decode, plays a silent buffer once to pre-initialize the OS audio output stream
 *   (warm-up). This eliminates latency on the first shot sound
 * - Ensures AudioContext resume via user gesture (pointerdown / keydown)
 * - Executes re-warm-up on statechange / visibilitychange
 * - Monophonic: stops previous playback before playing a new sound (prevents overlap)
 */
export function useAudioPlayback() {
  useEffect(() => {
    ensureInitialized();
  }, []);

  /**
   * Play the cached AudioBuffer at the specified gain.
   *
   * If the AudioContext is not in 'running' state (e.g. suspended after idle,
   * or interrupted by the OS), attempts resume() before playback.
   * Uses best-effort: plays regardless of whether resume succeeds.
   */
  const playBuffer = useCallback((gain: number) => {
    const ctx = sharedCtx;
    const buffer = sharedBuffer;
    if (!ctx || !buffer) return;

    const play = () => {
      // Monophonic: stop previous playback
      if (sharedActiveSource) {
        try {
          sharedActiveSource.stop();
        } catch {
          /* already stopped */
        }
      }

      const source = ctx.createBufferSource();
      source.buffer = buffer;

      const gainNode = ctx.createGain();
      gainNode.gain.value = gain;

      source.connect(gainNode);
      gainNode.connect(ctx.destination);

      sharedActiveSource = source;
      source.onended = () => {
        if (sharedActiveSource === source) {
          sharedActiveSource = null;
        }
      };

      source.start();
    };

    if (ctx.state !== 'running') {
      void ctx.resume().then(play, play);
    } else {
      play();
    }
  }, []);

  /** Play impact sound at the store's audioVolume when a supported target is connected. */
  const playShotSound = useCallback(() => {
    const { deviceId, audioVolume } = useSessionStore.getState();
    if (deviceId === null || !SHOT_SOUND_DEVICE_IDS.has(deviceId)) return;
    if (audioVolume === 0) return;
    playBuffer(audioVolume / 100);
  }, [playBuffer]);

  /** Play a test sound at the specified volume (0-100). */
  const playTestSound = useCallback(
    (volume: number) => {
      if (volume === 0) return;
      playBuffer(volume / 100);
    },
    [playBuffer],
  );

  return { playShotSound, playTestSound };
}
