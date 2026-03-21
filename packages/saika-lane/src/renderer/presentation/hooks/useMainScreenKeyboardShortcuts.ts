// SPDX-License-Identifier: MIT
import { useEffect } from 'react';

import { SHORTCUTS } from '@/renderer/presentation/constants/shortcuts';
import { getNextZoomMode, getPrevZoomMode, type ZoomMode } from '@/renderer/presentation/utils/zoomCalculator';

interface UseMainScreenKeyboardShortcutsParams {
  isSettingsModalOpen: boolean;
  setZoomMode: React.Dispatch<React.SetStateAction<ZoomMode>>;
  setSettingsInitialTab: (tab: 'general' | 'target' | 'connection') => void;
  setIsSettingsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

/**
 * Hook that manages keyboard shortcuts for MainScreen.
 *
 * - NumpadAdd: Zoom in
 * - NumpadSubtract: Zoom out
 * - Numpad5: Auto zoom
 * - NumpadDecimal: Toggle settings modal
 * - Escape: Close settings modal
 */
export function useMainScreenKeyboardShortcuts({
  isSettingsModalOpen,
  setZoomMode,
  setSettingsInitialTab,
  setIsSettingsModalOpen,
}: UseMainScreenKeyboardShortcutsParams): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === SHORTCUTS.ZOOM_IN) {
        event.preventDefault();
        setZoomMode((prev) => getNextZoomMode(prev));
        return;
      }

      if (event.code === SHORTCUTS.ZOOM_OUT) {
        event.preventDefault();
        setZoomMode((prev) => getPrevZoomMode(prev));
        return;
      }

      if (event.code === SHORTCUTS.AUTO_ZOOM) {
        event.preventDefault();
        setZoomMode('AUTO');
        return;
      }

      if (event.code === SHORTCUTS.SETTINGS) {
        event.preventDefault();
        setSettingsInitialTab('general');
        setIsSettingsModalOpen((prev) => !prev);
        return;
      }

      if (event.key === 'Escape' && isSettingsModalOpen) {
        event.preventDefault();
        setIsSettingsModalOpen(false);
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isSettingsModalOpen, setZoomMode, setSettingsInitialTab, setIsSettingsModalOpen]);
}
