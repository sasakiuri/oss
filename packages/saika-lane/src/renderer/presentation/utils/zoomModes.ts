// SPDX-License-Identifier: MIT
/**
 * Zoom mode definitions
 *
 * Provides zoom mode type definitions, cyclic order, display labels, and mode switching functions.
 */

/**
 * Zoom mode type
 *
 * The types of zoom modes selectable by the user.
 * Cyclic order: AUTO -> RING_8 -> RING_6 -> RING_4 -> FULL -> AUTO
 */
export type ZoomMode = 'AUTO' | 'RING_8' | 'RING_6' | 'RING_4' | 'FULL';

/**
 * Cyclic order of zoom modes
 *
 * Each click of the zoom button cycles through the modes in this array order.
 */
export const ZOOM_MODE_SEQUENCE: ZoomMode[] = ['AUTO', 'RING_8', 'RING_6', 'RING_4', 'FULL'];

/**
 * Display labels for zoom modes
 *
 * The label shown to the user in the UI for each mode.
 */
export const ZOOM_MODE_LABELS: Record<ZoomMode, string> = {
  AUTO: 'Auto',
  RING_8: '8-ring',
  RING_6: '6-ring',
  RING_4: '4-ring',
  FULL: 'Full',
};

/**
 * Get the next zoom mode
 *
 * Cyclically switches from the current mode to the next mode.
 * Wraps around to the first mode when the end of the array is reached.
 * Throws an error if an invalid mode is provided.
 *
 * @param current - Current zoom mode
 * @returns Next zoom mode
 *
 * @example
 * ```typescript
 * getNextZoomMode('AUTO'); // => 'RING_8'
 * getNextZoomMode('FULL'); // => 'AUTO' (wraps to first)
 * getNextZoomMode('INVALID' as ZoomMode); // => throws Error
 * ```
 */
export function getNextZoomMode(current: ZoomMode): ZoomMode {
  const currentIndex = ZOOM_MODE_SEQUENCE.indexOf(current);

  if (currentIndex === -1) {
    throw new Error(`Invalid ZoomMode: ${current}`);
  }

  const nextIndex = (currentIndex + 1) % ZOOM_MODE_SEQUENCE.length;
  return ZOOM_MODE_SEQUENCE[nextIndex] as ZoomMode;
}

/**
 * Get the previous zoom mode
 *
 * Cyclically switches from the current mode to the previous mode.
 * Wraps around to the last mode when the beginning of the array is reached.
 * Throws an error if an invalid mode is provided.
 *
 * @param current - Current zoom mode
 * @returns Previous zoom mode
 *
 * @example
 * ```typescript
 * getPrevZoomMode('RING_8'); // => 'AUTO'
 * getPrevZoomMode('AUTO'); // => 'FULL' (wraps to last)
 * getPrevZoomMode('INVALID' as ZoomMode); // => throws Error
 * ```
 */
export function getPrevZoomMode(current: ZoomMode): ZoomMode {
  const currentIndex = ZOOM_MODE_SEQUENCE.indexOf(current);

  if (currentIndex === -1) {
    throw new Error(`Invalid ZoomMode: ${current}`);
  }

  const prevIndex = (currentIndex - 1 + ZOOM_MODE_SEQUENCE.length) % ZOOM_MODE_SEQUENCE.length;
  return ZOOM_MODE_SEQUENCE[prevIndex] as ZoomMode;
}
