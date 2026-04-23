// SPDX-License-Identifier: MIT
import { useEffect } from 'react';

import { useUpdateStore } from '@/renderer/presentation/stores/updateStore';
import { updateService } from '@/renderer/services/updateService';

export function useUpdateEvents(): void {
  useEffect(() => {
    let cancelled = false;

    void updateService
      .getUpdateState()
      .then((state) => {
        if (!cancelled) {
          useUpdateStore.getState().setState(state);
        }
      })
      .catch(() => {
        // Best-effort bootstrap; event stream continues even if the initial query fails.
      });

    const unsubscribe = window.electronAPI.on.updateStateChanged((state) => {
      useUpdateStore.getState().setState(state);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);
}
