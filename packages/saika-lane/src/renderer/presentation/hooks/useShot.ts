// SPDX-License-Identifier: MIT
/** Loads session shots and refreshes them when a shot is recorded. */

import { useCallback, useEffect } from 'react';

import { mergeShots, useSessionStore } from '@/renderer/presentation/stores/sessionStore';
import { sessionService } from '@/renderer/services/sessionService';
import type { ShotDto } from '@/shared/ipc/contracts';

/**
 * Return type of the useShot hook
 */
export interface UseShotResult {
  /** Shot history */
  shots: ShotDto[];
  /** Action to re-fetch shot history */
  refreshShotHistory: () => Promise<void>;
}

export function useShot(): UseShotResult {
  const currentSessionId = useSessionStore((state) => state.currentSessionId);
  const shots = useSessionStore((state) => state.shots);
  const setShots = useSessionStore((state) => state.setShots);

  /**
   * Re-fetch shot history
   */
  const refreshShotHistory = useCallback(async () => {
    if (!currentSessionId) {
      return;
    }

    let resetDuringQuery = false;
    const unsubscribe = window.electronAPI.on.sessionReset(() => {
      resetDuringQuery = true;
    });
    try {
      const { shots: fetchedShots, nullifiedExtras } = await sessionService.getShotHistory({
        sessionId: currentSessionId,
      });

      const current = useSessionStore.getState();
      if (resetDuringQuery || current.currentSessionId !== currentSessionId) return;
      current.setNullifiedExtras(nullifiedExtras);
      setShots(mergeShots(fetchedShots, current.shots));
    } catch {
      // Shot history refresh failure — non-critical, will retry on next event
    } finally {
      unsubscribe();
    }
  }, [currentSessionId, setShots]);

  /**
   * Initial fetch of shot history when the session changes
   */
  useEffect(() => {
    if (currentSessionId) {
      void refreshShotHistory();
    }
  }, [currentSessionId, refreshShotHistory]);

  useEffect(
    () =>
      window.electronAPI.on.positionExtraNullified((event) => {
        if (event.sessionId === currentSessionId) void refreshShotHistory();
      }),
    [currentSessionId, refreshShotHistory],
  );

  return {
    shots,
    refreshShotHistory,
  };
}
