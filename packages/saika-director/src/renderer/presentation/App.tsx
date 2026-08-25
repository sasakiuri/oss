import { useState, useCallback } from 'react';
import { SplashScreen } from './features/shared/SplashScreen';
import { ChampionshipScreen } from './features/championship/ChampionshipScreen';
import { CompetitionControlScreen } from './features/competition-control/CompetitionControlScreen';
import { SettingsScreen } from './features/settings/SettingsScreen';
import { MainLayout } from './features/shared/layout/MainLayout';
import { ErrorBoundary, NotificationContainer, ConfirmDialog } from './features/shared/common';
import { useNavigationStore } from './stores/ui/navigation.store';

export function App() {
  const [initialized, setInitialized] = useState(false);
  const activeScreen = useNavigationStore((s) => s.activeScreen);

  const handleSplashComplete = useCallback(() => {
    setInitialized(true);
  }, []);

  if (!initialized) {
    return (
      <ErrorBoundary>
        <div className="flex h-full flex-col bg-vscode-bg text-vscode-text">
          <SplashScreen version={window.electronAPI.appVersion} onComplete={handleSplashComplete} />
        </div>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <div className="flex h-full flex-col bg-vscode-bg text-vscode-text">
        <MainLayout>
          <div key={activeScreen} className="min-h-full">
            {activeScreen === 'tournament' && <ChampionshipScreen />}
            {activeScreen === 'control' && <CompetitionControlScreen />}
            {activeScreen === 'settings' && <SettingsScreen />}
          </div>
        </MainLayout>
      </div>
      <NotificationContainer />
      <ConfirmDialog />
    </ErrorBoundary>
  );
}
