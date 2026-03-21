// SPDX-License-Identifier: MIT
/**
 * Log management store
 *
 * @description
 * Log entry state management using Zustand.
 * - Log entry array (max 1000 entries)
 * - Auto-scroll setting
 */

import { create } from 'zustand';

import type { LogEntry } from '@/shared/types/log';

/**
 * Maximum number of log entries to retain
 */
const MAX_LOG_ENTRIES = 1000;

/**
 * Log store state
 */
interface LogState {
  /** Log entry array */
  entries: LogEntry[];
  /** Auto-scroll enabled flag */
  autoScroll: boolean;
}

/**
 * Log store actions
 */
interface LogActions {
  /**
   * Add a log entry
   * @param entry - Log entry to add
   */
  addEntry: (entry: LogEntry) => void;

  /**
   * Clear log entries
   */
  clearEntries: () => void;

  /**
   * Change auto-scroll setting
   * @param autoScroll - Enable/disable auto-scroll
   */
  setAutoScroll: (autoScroll: boolean) => void;
}

/**
 * Initial state of the log store
 */
const initialState: LogState = {
  entries: [],
  autoScroll: true,
};

/**
 * Log management store
 *
 * @example
 * ```typescript
 * const { entries, autoScroll, addEntry, clearEntries, setAutoScroll } = useLogStore();
 *
 * // Add a log entry
 * addEntry({
 *   id: 'log-123',
 *   timestamp: new Date().toISOString(),
 *   level: 'info',
 *   message: 'Connection established successfully',
 *   source: 'usb',
 * });
 *
 * // Clear logs
 * clearEntries();
 *
 * // Disable auto-scroll
 * setAutoScroll(false);
 * ```
 */
export const useLogStore = create<LogState & LogActions>((set) => ({
  ...initialState,

  addEntry: (entry) => {
    set((state) => {
      // Append the new entry to the end of the array
      const newEntries = [...state.entries, entry];

      // Remove oldest entries if exceeding MAX_LOG_ENTRIES
      if (newEntries.length > MAX_LOG_ENTRIES) {
        return {
          entries: newEntries.slice(newEntries.length - MAX_LOG_ENTRIES),
        };
      }

      return { entries: newEntries };
    });
  },

  clearEntries: () => {
    set({ entries: [] });
  },

  setAutoScroll: (autoScroll) => {
    set({ autoScroll });
  },
}));
