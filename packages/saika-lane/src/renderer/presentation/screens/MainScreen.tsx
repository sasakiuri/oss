// SPDX-License-Identifier: MIT
/**
 * MainScreen component
 *
 * @description
 * Main application screen with VSCode-like layout.
 * Integrates SideMenu, SidePanel, TargetDisplay, StatusBar, DebugPane, SettingsModal.
 */

import React, { useCallback, useState } from 'react';

import { ConnectionWarningToast } from '@/renderer/presentation/components/ConnectionWarningToast';
import { DebugPane } from '@/renderer/presentation/components/DebugPane';
import { SettingsModal } from '@/renderer/presentation/components/SettingsModal';
import { SideMenu } from '@/renderer/presentation/components/SideMenu';
import { SidePanel } from '@/renderer/presentation/components/SidePanel';
import { StatusBar } from '@/renderer/presentation/components/StatusBar';
import { TargetDisplay } from '@/renderer/presentation/components/TargetDisplay';
import { TitleBar } from '@/renderer/presentation/components/TitleBar';
import { useAutoHideCursor } from '@/renderer/presentation/hooks/useAutoHideCursor';
import { useMainScreenKeyboardShortcuts } from '@/renderer/presentation/hooks/useMainScreenKeyboardShortcuts';
import { useModeSwitchActions } from '@/renderer/presentation/hooks/useModeSwitchActions';
import { useSession } from '@/renderer/presentation/hooks/useSession';
import { useShot } from '@/renderer/presentation/hooks/useShot';
import { useTitleBar } from '@/renderer/presentation/hooks/useTitleBar';
import { useConnectionStore } from '@/renderer/presentation/stores/connectionStore';
import { useSessionStore } from '@/renderer/presentation/stores/sessionStore';
import { getNextZoomMode, type ZoomMode } from '@/renderer/presentation/utils/zoomCalculator';
import { reportService } from '@/renderer/services/reportService';

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
  const { shots } = useShot();
  const { discipline } = useSessionStore();
  const { status } = useConnectionStore();
  const isConnected = status === 'connected';
  const [isDebugPaneOpen, setIsDebugPaneOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<'general' | 'target' | 'connection'>('general');
  const [zoomMode, setZoomMode] = useState<ZoomMode>('AUTO');

  useMainScreenKeyboardShortcuts({
    isSettingsModalOpen,
    setZoomMode,
    setSettingsInitialTab,
    setIsSettingsModalOpen,
  });

  const { isMaximized, isFullscreen, handleMinimize, handleMaximize, handleClose } = useTitleBar();

  const { handlePreparationClick, handleMatchClick, handleNextStageClick } = useModeSwitchActions();

  useAutoHideCursor(!isSettingsModalOpen, CURSOR_IDLE_TIMEOUT_MS);

  const handleZoomClick = () => {
    setZoomMode((prev) => getNextZoomMode(prev));
  };

  const handlePrintClick = useCallback(async () => {
    if (currentSessionId) {
      await reportService.openPrintWindow({ sessionId: currentSessionId });
    }
  }, [currentSessionId]);

  return (
    <div className={`flex h-screen flex-col overflow-hidden bg-zinc-900 ${className}`.trim()}>
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
          onPrintClick={currentSessionId ? handlePrintClick : undefined}
        />

        <SidePanel />

        <main className="flex flex-1 flex-col items-center justify-center overflow-auto bg-zinc-900">
          {currentSessionId && discipline ? (
            <TargetDisplay shots={shots} discipline={discipline} zoomMode={zoomMode} />
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
