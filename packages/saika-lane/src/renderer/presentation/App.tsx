// SPDX-License-Identifier: MIT
/** Displays the splash and main screens and registers application shortcuts. */

import { useCallback } from 'react';

import { ModeSwitchConfirmation } from '@/renderer/presentation/components/ModeSwitchConfirmation';
import { useAppKeyboardShortcuts } from '@/renderer/presentation/hooks/useAppKeyboardShortcuts';
import { useAppNavigation } from '@/renderer/presentation/hooks/useAppNavigation';
import { useCompetition } from '@/renderer/presentation/hooks/useCompetition';
import { useEventSubscriptions } from '@/renderer/presentation/hooks/useEventSubscriptions';
import { useModeSwitchActions } from '@/renderer/presentation/hooks/useModeSwitchActions';
import { useSavedSettingsRestore } from '@/renderer/presentation/hooks/useSavedSettingsRestore';
import { useSession } from '@/renderer/presentation/hooks/useSession';
import { MainScreen } from '@/renderer/presentation/screens/MainScreen';
import { SplashScreen } from '@/renderer/presentation/screens/SplashScreen';
import { usePrintStore } from '@/renderer/presentation/stores/printStore';
import { windowService } from '@/renderer/services/windowService';
import type { ElectronAPI } from '@/shared/types';

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

function App() {
  const { currentSessionId } = useSession();
  const { startCompetition } = useCompetition();

  useSavedSettingsRestore();
  useEventSubscriptions();

  const { screen } = useAppNavigation({
    startCompetition,
  });

  const modeSwitchActions = useModeSwitchActions();
  const { handlePreparationClick, handleMatchClick, handleNextStageClick, confirmation, confirm, cancelConfirmation } =
    modeSwitchActions;

  const handlePrint = useCallback(async () => {
    if (!currentSessionId) return;
    await usePrintStore.getState().print(currentSessionId);
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
      return (
        <>
          <MainScreen modeSwitchActions={modeSwitchActions} />
          <ModeSwitchConfirmation
            message={confirmation?.message ?? null}
            onConfirm={confirm}
            onCancel={cancelConfirmation}
          />
        </>
      );

    default:
      return <SplashScreen version={window.electronAPI.appVersion} />;
  }
}

export default App;
