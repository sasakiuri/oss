// SPDX-License-Identifier: MIT
import { useCallback, useEffect, useRef } from 'react';

import shotSound from '@/assets/sounds/shot.wav';
import { useSessionStore } from '@/renderer/presentation/stores/sessionStore';

/**
 * Web Audio API based shot impact sound playback hook.
 *
 * On mount, fetches WAV, decodes via decodeAudioData, and caches as AudioBuffer.
 * On playback, uses BufferSource + GainNode for immediate sound output.
 * Only plays impact sound for MT-201 devices.
 *
 * - AudioContext is created on mount with `latencyHint: 'interactive'` and immediately resumed
 * - After WAV decode, plays a silent buffer once to pre-initialize the OS audio output stream
 *   (warm-up). This eliminates latency on the first shot sound
 * - Ensures AudioContext resume via user gesture (pointerdown / keydown)
 * - Executes re-warm-up on statechange / visibilitychange
 * - Monophonic: stops previous playback before playing a new sound (prevents overlap)
 */
export function useAudioPlayback() {
  const ctxRef = useRef<AudioContext | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);

  useEffect(() => {
    let disposed = false;
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    ctxRef.current = ctx;

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
        if (!disposed) {
          bufferRef.current = decoded;

          // Warm-up: play silent buffer to pre-initialize the OS audio output stream
          warmup();
        }
      })
      .catch(() => {
        /* non-critical: shot sound init failure is not fatal */
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

    return () => {
      disposed = true;
      activeSourceRef.current = null;
      ctxRef.current = null;
      bufferRef.current = null;
      // Remove all listeners
      window.removeEventListener('pointerdown', onGesture);
      window.removeEventListener('keydown', onGesture);
      ctx.onstatechange = null;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      ctx.close();
    };
  }, []);

  /**
   * Play the cached AudioBuffer at the specified gain.
   */
  const playBuffer = useCallback((gain: number) => {
    const ctx = ctxRef.current;
    const buffer = bufferRef.current;
    if (!ctx || !buffer) return;

    // Monophonic: stop previous playback
    if (activeSourceRef.current) {
      try {
        activeSourceRef.current.stop();
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

    activeSourceRef.current = source;
    source.onended = () => {
      if (activeSourceRef.current === source) {
        activeSourceRef.current = null;
      }
    };

    source.start();
  }, []);

  /** Play impact sound at the store's audioVolume when an MT-201 device is connected. */
  const playShotSound = useCallback(() => {
    const { deviceId, audioVolume } = useSessionStore.getState();
    if (deviceId !== 'MT201') return;
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
