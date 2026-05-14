// SPDX-License-Identifier: MIT
/**
 * App Component
 *
 * @description
 * Root application component with screen navigation and keyboard shortcuts.
 *
 * Screen Flow:
 * 1. SplashScreen (2 seconds)
 * 2. MainScreen (primary interface)
 *
 * Keyboard Shortcuts:
 * - Numpad1: Preparation mode switch (MainScreen only)
 * - Numpad2: Match mode switch (MainScreen only)
 * - Numpad3: Next Stage (MainScreen only)
 * - Numpad9: Print (MainScreen only)
 * - F11: Fullscreen toggle (all screens)
 *
 * Note: NumpadDecimal and ESC are handled inside MainScreen (SettingsModal toggle)
 */

import { useCallback } from 'react';

import { useAppKeyboardShortcuts } from '@/renderer/presentation/hooks/useAppKeyboardShortcuts';
import { useAppNavigation } from '@/renderer/presentation/hooks/useAppNavigation';
import { useCompetition } from '@/renderer/presentation/hooks/useCompetition';
import { useEventSubscriptions } from '@/renderer/presentation/hooks/useEventSubscriptions';
import { useModeSwitchActions } from '@/renderer/presentation/hooks/useModeSwitchActions';
import { useSavedSettingsRestore } from '@/renderer/presentation/hooks/useSavedSettingsRestore';
import { useSession } from '@/renderer/presentation/hooks/useSession';
import { MainScreen } from '@/renderer/presentation/screens/MainScreen';
import { SplashScreen } from '@/renderer/presentation/screens/SplashScreen';
import { reportService } from '@/renderer/services/reportService';
import { windowService } from '@/renderer/services/windowService';
import type { ElectronAPI } from '@/shared/types';

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

/**
 * App Component
 */
function App() {
  const { currentSessionId } = useSession();
  const { startCompetition } = useCompetition();

  useSavedSettingsRestore();
  useEventSubscriptions();

  const { screen } = useAppNavigation({
    startCompetition,
  });

  const { handlePreparationClick, handleMatchClick, handleNextStageClick } = useModeSwitchActions();

  const handlePrint = useCallback(async () => {
    if (!currentSessionId) return;
    await reportService.openPrintWindow({ sessionId: currentSessionId });
  }, [currentSessionId]);

  const handleToggleFullscreen = useCallback(async () => {
    try {
      await windowService.toggleFullscreen();
    } catch {
      // Fullscreen toggle failure — silently handled
    }
  }, []);

  useAppKeyboardShortcuts({
    screen,
    onPreparationClick: handlePreparationClick,
    onMatchClick: handleMatchClick,
    onNextStageClick: handleNextStageClick,
    onPrint: currentSessionId ? handlePrint : undefined,
    onToggleFullscreen: handleToggleFullscreen,
  });

  switch (screen) {
    case 'splash':
      return <SplashScreen version={window.electronAPI.appVersion} />;

    case 'main':
      return <MainScreen />;

    default:
      return <SplashScreen version={window.electronAPI.appVersion} />;
  }
}

export default App;
