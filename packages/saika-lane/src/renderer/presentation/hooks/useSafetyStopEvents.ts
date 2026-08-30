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
    // Keep renderer tests and a rolling preload upgrade recoverable. The main
    // process query still restores the latch when the push channel is absent.
    const unsubscribe = window.electronAPI.on.safetyStopChanged?.(setState) ?? (() => undefined);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [setState]);
}
