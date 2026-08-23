// SPDX-License-Identifier: MIT
import { useEffect } from 'react';

import { useSessionStore } from '@/renderer/presentation/stores/sessionStore';

import { useAudioPlayback } from './useAudioPlayback';

/**
 * Subscription to shot IPC events
 *
 * - shotReceived: Low-latency device signal. Framed protocols validate first;
 *   direct streams notify on chunk receipt.
 * - shotRecorded: After CQRS processing completion -> add shot data to the store
 */
export function useShotEvents(): void {
  const addShot = useSessionStore((s) => s.addShot);
  const { playShotSound } = useAudioPlayback();

  useEffect(() => {
    // Early sound playback on USB data receipt (before CQRS processing)
    const unsubSound = window.electronAPI.on.shotReceived(() => {
      playShotSound();
    });

    const unsubShot = window.electronAPI.on.shotRecorded((event) => {
      addShot(event.shot);
    });

    return () => {
      unsubSound();
      unsubShot();
    };
  }, [addShot, playShotSound]);
}
