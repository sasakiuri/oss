// SPDX-License-Identifier: MIT
import { useEffect } from 'react';

import { useSessionStore } from '@/renderer/presentation/stores/sessionStore';

/**
 * Subscription to session-related IPC events
 *
 * - sessionStarted: Set session ID + transition to sighting mode
 * - modeSwitched: Switch mode
 * - sessionReset: Clear shooting data while preserving session context
 */
export function useSessionEvents(): void {
  const setSessionId = useSessionStore((s) => s.setSessionId);
  const setMode = useSessionStore((s) => s.setMode);
  const setDiscipline = useSessionStore((s) => s.setDiscipline);
  const resetSessionStore = useSessionStore((s) => s.resetSession);
  const clearSessionData = useSessionStore((s) => s.clearSessionData);

  useEffect(() => {
    const unsubscribe = window.electronAPI.on.sessionStarted((event) => {
      resetSessionStore();
      setSessionId(event.sessionId);
      if (event.discipline) {
        setDiscipline(event.discipline);
      }
    });
    return () => unsubscribe();
  }, [resetSessionStore, setSessionId, setDiscipline]);

  useEffect(() => {
    const unsubscribe = window.electronAPI.on.modeSwitched((event) => {
      setMode(event.mode);
    });
    return () => unsubscribe();
  }, [setMode]);

  useEffect(() => {
    const unsubscribe = window.electronAPI.on.sessionReset(() => {
      clearSessionData();
    });
    return () => unsubscribe();
  }, [clearSessionData]);
}
