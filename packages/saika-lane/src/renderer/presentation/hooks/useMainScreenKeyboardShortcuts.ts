// SPDX-License-Identifier: MIT
import { useEffect } from 'react';

import { SHORTCUTS } from '@/renderer/presentation/constants/shortcuts';
import { isEditableShortcutTarget } from '@/renderer/presentation/utils/keyboardShortcuts';
import type { ZoomMode } from '@/renderer/presentation/utils/zoomCalculator';

interface UseMainScreenKeyboardShortcutsParams {
  isSettingsModalOpen: boolean;
  onZoomClick: () => void;
  setZoomMode: React.Dispatch<React.SetStateAction<ZoomMode>>;
  setSettingsInitialTab: (tab: 'general' | 'target' | 'connection') => void;
  setIsSettingsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

/**
 * Hook that manages keyboard shortcuts for MainScreen.
 *
 * - Numpad6: Cycle zoom mode
 * - Numpad5: Auto zoom
 * - NumpadDecimal: Toggle settings modal
 * - Escape: Close settings modal
 */
export function useMainScreenKeyboardShortcuts({
  isSettingsModalOpen,
  onZoomClick,
  setZoomMode,
  setSettingsInitialTab,
  setIsSettingsModalOpen,
}: UseMainScreenKeyboardShortcutsParams): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isEditableTarget = isEditableShortcutTarget(event.target);

      if (isEditableTarget && event.key !== 'Escape') {
        return;
      }

      if (event.code === SHORTCUTS.ZOOM) {
        event.preventDefault();
        onZoomClick();
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
  }, [isSettingsModalOpen, onZoomClick, setZoomMode, setSettingsInitialTab, setIsSettingsModalOpen]);
}
