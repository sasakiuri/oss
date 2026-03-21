// SPDX-License-Identifier: MIT
import { useEffect } from 'react';

import { useLogStore } from '@/renderer/presentation/stores/logStore';

/**
 * Subscription to the logMessage IPC event
 */
export function useLogEvents(): void {
  useEffect(() => {
    const unsubscribe = window.electronAPI.on.logMessage((event) => {
      useLogStore.getState().addEntry(event.entry);
    });
    return () => {
      unsubscribe();
    };
  }, []);
}
