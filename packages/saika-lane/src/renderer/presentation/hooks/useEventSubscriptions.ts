// SPDX-License-Identifier: MIT
import { useConnectionEvents } from './useConnectionEvents';
import { useDirectorMembershipEvents } from './useDirectorMembershipEvents';
import { useFinalCueEvents } from './useFinalCueEvents';
import { useLogEvents } from './useLogEvents';
import { usePhaseEvents } from './usePhaseEvents';
import { useSafetyStopEvents } from './useSafetyStopEvents';
import { useSessionEvents } from './useSessionEvents';
import { useShotEvents } from './useShotEvents';
import { useTimerEvents } from './useTimerEvents';
import { useUpdateEvents } from './useUpdateEvents';

/**
 * Unified hook that subscribes to all IPC events and reflects them in stores.
 *
 * Call this exactly once at the root of the App component.
 */
export function useEventSubscriptions(): void {
  useDirectorMembershipEvents();
  useSessionEvents();
  useSafetyStopEvents();
  useFinalCueEvents();
  useConnectionEvents();
  useShotEvents();
  usePhaseEvents();
  useTimerEvents();
  useLogEvents();
  useUpdateEvents();
}
