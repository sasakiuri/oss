// SPDX-License-Identifier: MIT
import { useEffect } from 'react';

import { useUpdateStore } from '@/renderer/presentation/stores/updateStore';
import { updateService } from '@/renderer/services/updateService';

export function useUpdateEvents(): void {
  useEffect(() => {
    let cancelled = false;
    let eventGeneration = 0;

    const unsubscribe = window.electronAPI.on.updateStateChanged((state) => {
      eventGeneration += 1;
      useUpdateStore.getState().setState(state);
    });

    const bootstrapGeneration = eventGeneration;

    void updateService
      .getUpdateState()
      .then((state) => {
        if (!cancelled && eventGeneration === bootstrapGeneration) {
          useUpdateStore.getState().setState(state);
        }
      })
      .catch(() => {
        // Best-effort bootstrap; event stream continues even if the initial query fails.
      });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);
}
