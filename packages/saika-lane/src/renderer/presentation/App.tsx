// SPDX-License-Identifier: MIT
/** Displays the splash and main screens and registers application shortcuts. */

import { ModeSwitchConfirmation } from '@/renderer/presentation/components/ModeSwitchConfirmation';
import { useAppKeyboardShortcuts } from '@/renderer/presentation/hooks/useAppKeyboardShortcuts';
import { useAppNavigation } from '@/renderer/presentation/hooks/useAppNavigation';
import { useEventSubscriptions } from '@/renderer/presentation/hooks/useEventSubscriptions';
import { useModeSwitchActions } from '@/renderer/presentation/hooks/useModeSwitchActions';
import { useSavedSettingsRestore } from '@/renderer/presentation/hooks/useSavedSettingsRestore';
import { toggleFullscreen } from '@/renderer/presentation/hooks/useTitleBar';
import { MainScreen } from '@/renderer/presentation/screens/MainScreen';
import { SplashScreen } from '@/renderer/presentation/screens/SplashScreen';
import { StartupRecovery } from '@/renderer/presentation/screens/StartupRecovery';
import { usePrintStore } from '@/renderer/presentation/stores/printStore';
import { useSessionStore } from '@/renderer/presentation/stores/sessionStore';

function App() {
  const currentSessionId = useSessionStore((state) => state.currentSessionId);
  const printCurrentSession = usePrintStore((state) => state.printCurrentSession);

  useSavedSettingsRestore();
  useEventSubscriptions();

  const navigation = useAppNavigation();

  const modeSwitchActions = useModeSwitchActions();
  const { handlePreparationClick, handleMatchClick, handleNextStageClick, confirmation, confirm, cancelConfirmation } =
    modeSwitchActions;

  useAppKeyboardShortcuts({
    screen: navigation.screen,
    onPreparationClick: handlePreparationClick,
    onMatchClick: handleMatchClick,
    onNextStageClick: handleNextStageClick,
    onPrint: currentSessionId ? printCurrentSession : undefined,
    onToggleFullscreen: toggleFullscreen,
  });

  switch (navigation.screen) {
    case 'splash':
      return <SplashScreen version={window.electronAPI.appVersion} />;

    case 'recovery':
      return <StartupRecovery state={navigation.startup} onRetry={navigation.retry} />;

    case 'main':
      return (
        <>
          <MainScreen modeSwitchActions={modeSwitchActions} onFinishSavedRun={navigation.retry} />
          <ModeSwitchConfirmation
            message={confirmation?.message ?? null}
            onConfirm={confirm}
            onCancel={cancelConfirmation}
          />
        </>
      );
  }
}

export default App;
