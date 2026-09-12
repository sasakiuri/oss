// SPDX-License-Identifier: MIT
import { useEffect } from 'react';

import { useSessionStore } from '@/renderer/presentation/stores/sessionStore';

import { useAudioPlayback } from './useAudioPlayback';

/**
 * Subscription to shot IPC events
 *
 * - shotReceived: One notification per converted shot, before persistence.
 * - shotRecorded: After CQRS processing completion -> add shot data to the store
 */
export function useShotEvents(): void {
  const addShot = useSessionStore((s) => s.addShot);
  const { playShotSound } = useAudioPlayback();

  useEffect(() => {
    // Play after conversion and before CQRS persistence completes.
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
