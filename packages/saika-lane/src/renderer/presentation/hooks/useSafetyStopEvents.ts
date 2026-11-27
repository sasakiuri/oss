// SPDX-License-Identifier: MIT
import { useEffect } from 'react';

import { useSafetyStopStore } from '@/renderer/presentation/stores/safetyStopStore';
import { mqttService } from '@/renderer/services/mqttService';

/** Restores the durable latch and then follows push updates. */
export function useSafetyStopEvents(): void {
  const setState = useSafetyStopStore((store) => store.setState);

  useEffect(() => {
    let active = true;
    void mqttService
      .getSafetyState()
      .then((state) => {
        if (active) setState(state);
      })
      .catch(() => undefined);
    const unsubscribe = window.electronAPI.on.safetyStopChanged(setState);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [setState]);
}
