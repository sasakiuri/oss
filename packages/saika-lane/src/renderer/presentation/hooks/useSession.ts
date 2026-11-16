// SPDX-License-Identifier: MIT
/** Exposes the current session and the mode switch command. */

import { useAsyncAction } from '@/renderer/presentation/hooks/useAsyncAction';
import { useSessionStore } from '@/renderer/presentation/stores/sessionStore';
import { sessionService } from '@/renderer/services/sessionService';
import type { SessionMode } from '@/shared/ipc/contracts';

/**
 * Return type of the useSession hook
 */
export interface UseSessionResult {
  /** Current session ID (null when no session is active) */
  currentSessionId: string | null;
  /** Switch mode action; a rejection that is not an Error gets a default message. */
  switchMode: (mode: SessionMode) => Promise<void>;
}

export function useSession(): UseSessionResult {
  const currentSessionId = useSessionStore((state) => state.currentSessionId);
  const setMode = useSessionStore((state) => state.setMode);

  const switching = useAsyncAction(
    async (targetMode: SessionMode) => {
      if (!currentSessionId) {
        throw new Error('Session has not been started');
      }
      const seriesStartIndex = useSessionStore.getState().shots.length;
      await sessionService.switchMode({
        sessionId: currentSessionId,
        mode: targetMode,
      });
      useSessionStore.getState().setCurrentSeriesStartIndex(seriesStartIndex);
      setMode(targetMode);
    },
    { errorMessage: 'An error occurred while switching mode' },
  );

  return {
    currentSessionId,
    switchMode: switching.execute,
  };
}
