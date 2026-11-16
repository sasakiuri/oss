// SPDX-License-Identifier: MIT
import { useEffect } from 'react';

import { useDirectorMembershipStore } from '@/renderer/presentation/stores/directorMembershipStore';
import { logRendererError } from '@/renderer/presentation/stores/logStore';
import { errorMessage } from '@/renderer/presentation/utils/errorMessage';
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
        store.failHydration();
        logRendererError('director-membership-error', `Failed to load Director membership: ${errorMessage(error)}`);
      },
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
}
