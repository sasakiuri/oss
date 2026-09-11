// SPDX-License-Identifier: MIT
/**
 * MainScreen component
 *
 * Main application screen with VSCode-like layout.
 * Integrates SideMenu, SidePanel, TargetDisplay, StatusBar, DebugPane, SettingsModal.
 */

import React, { useCallback, useState } from 'react';

import { ConnectionWarningToast } from '@/renderer/presentation/components/ConnectionWarningToast';
import { DebugPane } from '@/renderer/presentation/components/DebugPane';
import { FinalCommandCue } from '@/renderer/presentation/components/FinalCommandCue';
import { SafetyStopOverlay } from '@/renderer/presentation/components/SafetyStopOverlay';
import { SettingsModal } from '@/renderer/presentation/components/SettingsModal';
import { SideMenu } from '@/renderer/presentation/components/SideMenu';
import { SidePanel } from '@/renderer/presentation/components/SidePanel';
import { StatusBar } from '@/renderer/presentation/components/StatusBar';
import { TargetDisplay } from '@/renderer/presentation/components/TargetDisplay';
import { TimedTargetOverlay } from '@/renderer/presentation/components/TimedTargetOverlay';
import { TitleBar } from '@/renderer/presentation/components/TitleBar';
import { useAutoHideCursor } from '@/renderer/presentation/hooks/useAutoHideCursor';
import { useMainScreenKeyboardShortcuts } from '@/renderer/presentation/hooks/useMainScreenKeyboardShortcuts';
import { useModeSwitchActions } from '@/renderer/presentation/hooks/useModeSwitchActions';
import { useSession } from '@/renderer/presentation/hooks/useSession';
import { useShot } from '@/renderer/presentation/hooks/useShot';
import { useTitleBar } from '@/renderer/presentation/hooks/useTitleBar';
import { useCompetitionStore } from '@/renderer/presentation/stores/competitionStore';
import { useConnectionStore } from '@/renderer/presentation/stores/connectionStore';
import { usePrintStore } from '@/renderer/presentation/stores/printStore';
import { useSessionStore } from '@/renderer/presentation/stores/sessionStore';
import { getNextZoomMode, type ZoomMode } from '@/renderer/presentation/utils/zoomCalculator';

/**
 * MainScreen component props
 */
export interface MainScreenProps {
  /** Optional CSS class name */
  className?: string;
}

const CURSOR_IDLE_TIMEOUT_MS = 5000;

/**
 * MainScreen component
 */
export const MainScreen: React.FC<MainScreenProps> = ({ className = '' }) => {
  const useNativeControlsOverlay = window.electronAPI.hasNativeWindowFrame;
  const { currentSessionId } = useSession();
  const { isPrinting, error: printError, dismissError } = usePrintStore();
  const { shots } = useShot();
  const { discipline } = useSessionStore();
  const preparationShotNumberResetIndices = useSessionStore((s) => s.preparationShotNumberResetIndices);
  const { status } = useConnectionStore();
  const isConnected = status === 'connected';
  const interruption = useCompetitionStore((state) => state.interruption);
  const targetProfileId = useCompetitionStore((state) => state.targetProfileId);
  const scoringGaugeProfileId = useCompetitionStore((state) => state.scoringGaugeProfileId);
  const [isDebugPaneOpen, setIsDebugPaneOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<'general' | 'target' | 'connection' | 'printing'>(
    'general',
  );
  const [zoomMode, setZoomMode] = useState<ZoomMode>('AUTO');

  const handleZoomClick = useCallback(() => {
    setZoomMode((prev) => getNextZoomMode(prev));
  }, []);

  useMainScreenKeyboardShortcuts({
    isSettingsModalOpen,
    onZoomClick: handleZoomClick,
    setZoomMode,
    setSettingsInitialTab,
    setIsSettingsModalOpen,
  });

  const { isMaximized, isFullscreen, handleMinimize, handleMaximize, handleClose } = useTitleBar();

  const { handlePreparationClick, handleMatchClick, handleNextStageClick } = useModeSwitchActions();

  useAutoHideCursor(!isSettingsModalOpen, CURSOR_IDLE_TIMEOUT_MS);

  const handlePrintClick = useCallback(async () => {
    if (currentSessionId) {
      await usePrintStore.getState().print(currentSessionId);
    }
  }, [currentSessionId]);

  return (
    <div className={`flex h-screen flex-col overflow-hidden bg-zinc-900 ${className}`.trim()}>
      {isPrinting && (
        <div role="status" className="absolute bottom-4 left-24 z-40 rounded bg-zinc-800 p-3 text-zinc-100">
          Preparing print job...
        </div>
      )}
      {printError && (
        <div
          role="alert"
          className="absolute bottom-4 left-24 z-40 max-w-lg rounded border border-red-500 bg-zinc-900 p-4 text-red-300"
        >
          <p>{printError}</p>
          <button
            onClick={() => {
              setSettingsInitialTab('printing');
              setIsSettingsModalOpen(true);
            }}
            className="mr-4 mt-3 text-zinc-100"
          >
            Printing Settings
          </button>
          <button onClick={dismissError} className="mt-3 text-zinc-100">
            Dismiss
          </button>
        </div>
      )}
      <SafetyStopOverlay />
      <FinalCommandCue />
      <TimedTargetOverlay />
      <TitleBar
        isMaximized={isMaximized}
        isFullscreen={isFullscreen}
        onMinimize={handleMinimize}
        onMaximize={handleMaximize}
        onClose={handleClose}
        useNativeControlsOverlay={useNativeControlsOverlay}
        onSettingsOpen={() => {
          setSettingsInitialTab('general');
          setIsSettingsModalOpen(true);
        }}
        onDebugPanelToggle={() => setIsDebugPaneOpen((prev) => !prev)}
        onZoomIn={handleZoomClick}
        onZoomOut={handleZoomClick}
      />
      <div className="flex flex-1 overflow-hidden">
        <SideMenu
          onZoomClick={handleZoomClick}
          onPreparationClick={handlePreparationClick}
          onMatchClick={handleMatchClick}
          onNextStageClick={handleNextStageClick}
          onSettingsClick={() => {
            setSettingsInitialTab('general');
            setIsSettingsModalOpen(true);
          }}
          onPrintClick={currentSessionId && !isPrinting ? handlePrintClick : undefined}
        />

        <SidePanel />

        <main className="relative flex flex-1 flex-col items-center justify-center overflow-auto bg-zinc-900">
          {interruption && interruption.status !== 'RUNNING_MATCH' && (
            <div
              className={`pointer-events-none absolute inset-0 z-20 flex items-center justify-center ${
                interruption.status === 'SIGHTING' ? 'bg-amber-950/50' : 'bg-red-950/75'
              }`}
              role="status"
              aria-live="assertive"
            >
              <div className="rounded-xl border-4 border-white bg-zinc-950/90 px-16 py-10 text-center text-white shadow-2xl">
                <div className="text-7xl font-black tracking-widest">
                  {interruption.status === 'SIGHTING' ? 'SIGHTING' : 'STOP'}
                </div>
                <div className="mt-3 text-2xl font-semibold">
                  {interruption.status === 'SIGHTING'
                    ? 'Unlimited sighting shots authorized'
                    : 'Range interruption — await Director instruction'}
                </div>
              </div>
            </div>
          )}
          {currentSessionId && discipline ? (
            <TargetDisplay
              shots={shots}
              discipline={discipline}
              zoomMode={zoomMode}
              preparationShotNumberResetIndices={preparationShotNumberResetIndices}
              targetProfileId={targetProfileId}
              scoringGaugeProfileId={scoringGaugeProfileId}
            />
          ) : (
            <div className="text-center text-zinc-400">
              <p className="mb-2 text-lg">No session started</p>
              <p className="text-sm">Please select a discipline from Settings</p>
            </div>
          )}
        </main>
      </div>

      {isDebugPaneOpen && <DebugPane onClose={() => setIsDebugPaneOpen(false)} className="h-64" />}

      <ConnectionWarningToast
        onOpenSettings={() => {
          setSettingsInitialTab('connection');
          setIsSettingsModalOpen(true);
        }}
      />

      <StatusBar isConnected={isConnected} onDebugPanelToggle={() => setIsDebugPaneOpen((prev) => !prev)} />

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        initialTab={settingsInitialTab}
      />
    </div>
  );
};
