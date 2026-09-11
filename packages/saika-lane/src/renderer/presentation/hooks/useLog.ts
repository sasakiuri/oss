// SPDX-License-Identifier: MIT
/** Subscribes to log messages and exposes the log store controls. */

import { useLogStore } from '@/renderer/presentation/stores/logStore';
import type { LogEntry } from '@/shared/types/log';

/**
 * Return type of the useLog hook
 */
export interface UseLogResult {
  /** Array of log entries */
  entries: LogEntry[];
  /** Auto-scroll enabled flag */
  autoScroll: boolean;
  /** Clear log action */
  clearEntries: () => void;
  /** Change auto-scroll setting action */
  setAutoScroll: (autoScroll: boolean) => void;
}

export function useLog(): UseLogResult {
  const { entries, autoScroll, clearEntries, setAutoScroll } = useLogStore();

  return {
    entries,
    autoScroll,
    clearEntries,
    setAutoScroll,
  };
}
