// SPDX-License-Identifier: MIT
import { useEffect } from 'react';

import { useDirectorMembershipStore } from '@/renderer/presentation/stores/directorMembershipStore';
import { useLogStore } from '@/renderer/presentation/stores/logStore';
import { mqttService } from '@/renderer/services/mqttService';

/** Subscribe before querying so a delayed snapshot cannot overwrite a newer membership. */
export function useDirectorMembershipEvents(): void {
  useEffect(() => {
    let active = true;
    const store = useDirectorMembershipStore.getState();
    store.beginHydration();
    const unsubscribe = window.electronAPI.on.directorMembershipChanged((membership) => {
      if (active) store.applyChange(membership);
    });
    void mqttService.getDirectorMembership().then(
      (membership) => {
        if (active) store.completeHydration(membership);
      },
      (error: unknown) => {
        if (!active) return;
        useLogStore.getState().addEntry({
          id: `director-membership-error-${Date.now()}`,
          timestamp: new Date().toISOString(),
          level: 'error',
          message: `Failed to load Director membership: ${error instanceof Error ? error.message : String(error)}`,
          source: 'renderer',
        });
      },
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
}
