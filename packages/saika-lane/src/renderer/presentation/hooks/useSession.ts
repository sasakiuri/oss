// SPDX-License-Identifier: MIT
/** Exposes session commands, scores, and session event subscriptions. */

import { useCallback } from 'react';

import { useAsyncAction } from '@/renderer/presentation/hooks/useAsyncAction';
import { useSessionStore } from '@/renderer/presentation/stores/sessionStore';
import { sessionService } from '@/renderer/services/sessionService';
import type { Discipline, SessionMode } from '@/shared/ipc/contracts';

/**
 * Return type of the useSession hook
 */
export interface UseSessionResult {
  /** Current session ID (null when no session is active) */
  currentSessionId: string | null;
  mode: SessionMode;
  /** Total score */
  totalScore: number;
  /** Array of scores per series */
  seriesScores: number[];
  /** Start session action */
  startSession: (discipline: string) => Promise<void>;
  /** Switch mode action */
  switchMode: (mode: SessionMode) => Promise<void>;
  /** Reset session action */
  resetSession: () => Promise<void>;
  /** Session start in-progress flag */
  isStarting: boolean;
  /** Mode switch in-progress flag */
  isSwitching: boolean;
  /** Reset in-progress flag */
  isResetting: boolean;
  /** Error (null when no error) */
  error: Error | null;
}

export function useSession(): UseSessionResult {
  const { currentSessionId, mode, totalScore, seriesScores, setSessionId, setMode, setDiscipline, clearSessionData } =
    useSessionStore();

  const starting = useAsyncAction(
    async (discipline: string) => {
      const disciplineValue = discipline as Discipline;
      const { sessionId } = await sessionService.startSession({
        discipline: disciplineValue,
      });
      setSessionId(sessionId);
      setDiscipline(disciplineValue);
    },
    { errorMessage: 'An error occurred while starting the session' },
  );

  const switching = useAsyncAction(
    async (targetMode: SessionMode) => {
      if (!currentSessionId) {
        throw new Error('Session has not been started');
      }
      await sessionService.switchMode({
        sessionId: currentSessionId,
        mode: targetMode,
      });
      setMode(targetMode);
    },
    { errorMessage: 'An error occurred while switching mode' },
  );

  const resetting = useAsyncAction(
    async () => {
      if (!currentSessionId) {
        throw new Error('Session has not been started');
      }
      await sessionService.resetSession({
        sessionId: currentSessionId,
      });
      clearSessionData();
    },
    { errorMessage: 'An error occurred while resetting the session' },
  );

  const startSession = useCallback(
    async (discipline: string) => {
      switching.clearError();
      resetting.clearError();
      await starting.execute(discipline);
    },
    [starting.execute, switching.clearError, resetting.clearError],
  );

  const switchMode = useCallback(
    async (targetMode: SessionMode) => {
      starting.clearError();
      resetting.clearError();
      await switching.execute(targetMode);
    },
    [switching.execute, starting.clearError, resetting.clearError],
  );

  const resetSession = useCallback(async () => {
    starting.clearError();
    switching.clearError();
    await resetting.execute();
  }, [resetting.execute, starting.clearError, switching.clearError]);

  return {
    currentSessionId,
    mode,
    totalScore,
    seriesScores,
    startSession,
    switchMode,
    resetSession,
    isStarting: starting.loading,
    isSwitching: switching.loading,
    isResetting: resetting.loading,
    error: starting.error ?? switching.error ?? resetting.error,
  };
}
