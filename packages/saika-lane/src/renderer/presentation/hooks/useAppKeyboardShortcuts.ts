// SPDX-License-Identifier: MIT
/**
 * Application keyboard shortcuts hook
 *
 * @description
 * Manages keyboard shortcuts at the App root level.
 * - Numpad1 : Switch to Preparation mode (MainScreen only)
 * - Numpad2 : Switch to Match mode (MainScreen only)
 * - Numpad3 : Next Stage (MainScreen only)
 * - Numpad9 : Open print window (MainScreen only)
 * - F11 : Toggle fullscreen (all screens)
 *
 * Note: NumpadDecimal and ESC are handled within MainScreen (SettingsModal toggle)
 */

import { useEffect } from 'react';

import { SHORTCUTS } from '@/renderer/presentation/constants/shortcuts';

/**
 * Parameters for useAppKeyboardShortcuts
 */
interface UseAppKeyboardShortcutsParams {
  /** Current screen */
  screen: string;
  /** Preparation mode switch callback */
  onPreparationClick: () => Promise<void>;
  /** Match mode switch callback */
  onMatchClick: () => Promise<void>;
  /** Next Stage callback */
  onNextStageClick: () => Promise<void>;
  /** Print callback (undefined when no session is active) */
  onPrint?: () => Promise<void>;
  /** Toggle fullscreen callback */
  onToggleFullscreen?: () => Promise<void>;
}

/**
 * Application keyboard shortcuts hook
 */
export function useAppKeyboardShortcuts({
  screen,
  onPreparationClick,
  onMatchClick,
  onNextStageClick,
  onPrint,
  onToggleFullscreen,
}: UseAppKeyboardShortcutsParams): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // F11: Toggle fullscreen (all screens)
      if (event.code === SHORTCUTS.FULLSCREEN) {
        event.preventDefault();
        if (onToggleFullscreen) {
          onToggleFullscreen();
        }
        return;
      }

      // MainScreen-only shortcuts
      if (screen === 'main') {
        // Numpad1: Preparation mode
        if (event.code === SHORTCUTS.PREPARATION) {
          event.preventDefault();
          onPreparationClick();
          return;
        }

        // Numpad2: Match mode
        if (event.code === SHORTCUTS.MATCH) {
          event.preventDefault();
          onMatchClick();
          return;
        }

        // Numpad3: Next Stage
        if (event.code === SHORTCUTS.NEXT_STAGE) {
          event.preventDefault();
          onNextStageClick();
          return;
        }

        // Numpad9: Print score sheet
        if (event.code === SHORTCUTS.PRINT) {
          event.preventDefault();
          if (onPrint) {
            onPrint();
          }
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [screen, onPreparationClick, onMatchClick, onNextStageClick, onPrint, onToggleFullscreen]);
}
