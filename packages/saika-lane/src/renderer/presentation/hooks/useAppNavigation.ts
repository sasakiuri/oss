// SPDX-License-Identifier: MIT
/** Shows the splash screen for two seconds, creates an idle session, then opens MainScreen. */

import { useCallback, useEffect, useRef, useState } from 'react';

import { useCompetitionStore } from '@/renderer/presentation/stores/competitionStore';
import { useSessionStore } from '@/renderer/presentation/stores/sessionStore';

/**
 * Screen type
 */
type Screen = 'splash' | 'main';

/**
 * Parameters for useAppNavigation
 */
interface UseAppNavigationParams {
  startCompetition: (competitionTypeId: string) => Promise<{ competitionId: string; sessionId: string }>;
}

/**
 * Return type of useAppNavigation
 */
interface UseAppNavigationReturn {
  /** Current screen */
  screen: Screen;
}

/**
 * Application screen navigation hook
 */
export function useAppNavigation({ startCompetition }: UseAppNavigationParams): UseAppNavigationReturn {
  const [screen, setScreen] = useState<Screen>('splash');
  const { currentSessionId } = useSessionStore();
  const inFlightRef = useRef(false);

  const navigateToMain = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    try {
      if (!currentSessionId) {
        const savedTypeId = useCompetitionStore.getState().savedCompetitionTypeId || 'BR60S';
        await startCompetition(savedTypeId);
      }
    } catch {
      // startCompetition failure must not block navigation to main screen
    } finally {
      setScreen('main');
      inFlightRef.current = false;
    }
  }, [currentSessionId, startCompetition]);

  // SplashScreen timer (2 seconds) → navigateToMain
  useEffect(() => {
    if (screen === 'splash') {
      const timer = setTimeout(() => {
        navigateToMain();
      }, 2000);

      return () => {
        clearTimeout(timer);
      };
    }

    return undefined;
  }, [screen, navigateToMain]);

  return { screen };
}
