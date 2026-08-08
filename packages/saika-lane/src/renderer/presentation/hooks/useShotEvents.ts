// SPDX-License-Identifier: MIT
import { useEffect } from 'react';

import { useSessionStore } from '@/renderer/presentation/stores/sessionStore';

import { useAudioPlayback } from './useAudioPlayback';

/**
 * Subscription to shot IPC events
 *
 * - shotReceived: Immediate signal for a validated target hit -> impact sound playback (low latency)
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
