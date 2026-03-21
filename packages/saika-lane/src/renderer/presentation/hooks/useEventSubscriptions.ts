// SPDX-License-Identifier: MIT
import { useConnectionEvents } from './useConnectionEvents';
import { useLogEvents } from './useLogEvents';
import { usePhaseEvents } from './usePhaseEvents';
import { useSessionEvents } from './useSessionEvents';
import { useShotEvents } from './useShotEvents';
import { useTimerEvents } from './useTimerEvents';

/**
 * Unified hook that subscribes to all IPC events and reflects them in stores.
 *
 * Call this exactly once at the root of the App component.
 */
export function useEventSubscriptions(): void {
  useSessionEvents();
  useConnectionEvents();
  useShotEvents();
  usePhaseEvents();
  useTimerEvents();
  useLogEvents();
}
