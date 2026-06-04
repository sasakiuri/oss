// SPDX-License-Identifier: MIT
/**
 * Shortcut definitions
 *
 * @description
 * Shortcut key definitions based on event.code (independent of NumLock state)
 */
export const SHORTCUTS = {
  /** Switch to Preparation mode */
  PREPARATION: 'Numpad1',
  /** Switch to Match mode */
  MATCH: 'Numpad2',
  /** Next Stage */
  NEXT_STAGE: 'Numpad3',
  /** Auto zoom */
  AUTO_ZOOM: 'Numpad5',
  /** Print */
  PRINT: 'Numpad9',
  /** Toggle settings modal */
  SETTINGS: 'NumpadDecimal',
  /** Cycle zoom mode */
  ZOOM: 'Numpad6',
  /** Toggle fullscreen */
  FULLSCREEN: 'F11',
} as const;

/** Shortcut key type */
export type ShortcutKey = (typeof SHORTCUTS)[keyof typeof SHORTCUTS];
