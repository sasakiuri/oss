// SPDX-License-Identifier: MIT
/**
 * Zoom mode type
 *
 * The types of zoom modes selectable by the user. RING_n fits the n ring to the screen and FULL the whole target,
 * so the magnification rises from FULL through RING_4 and RING_6 to RING_8.
 * Zoom In order: AUTO -> FULL -> RING_4 -> RING_6 -> RING_8 -> AUTO
 */
export type ZoomMode = 'AUTO' | 'RING_8' | 'RING_6' | 'RING_4' | 'FULL';

/**
 * Cyclic order of zoom modes
 *
 * Zoom In (the zoom button, Numpad6 and View > Zoom In) steps through this array toward higher magnification and
 * wraps from the closest view back to AUTO, so one key cycles through every mode. Zoom Out steps the other way.
 */
export const ZOOM_MODE_SEQUENCE: ZoomMode[] = ['AUTO', 'FULL', 'RING_4', 'RING_6', 'RING_8'];

/**
 * Get the next zoom mode
 *
 * Cyclically switches from the current mode to the next mode.
 * Wraps around to the first mode when the end of the array is reached.
 * Throws an error if an invalid mode is provided.
 *
 * @param current - Current zoom mode
 * @returns Next zoom mode
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
 */
export function getPrevZoomMode(current: ZoomMode): ZoomMode {
  const currentIndex = ZOOM_MODE_SEQUENCE.indexOf(current);

  if (currentIndex === -1) {
    throw new Error(`Invalid ZoomMode: ${current}`);
  }

  const prevIndex = (currentIndex - 1 + ZOOM_MODE_SEQUENCE.length) % ZOOM_MODE_SEQUENCE.length;
  return ZOOM_MODE_SEQUENCE[prevIndex] as ZoomMode;
}
