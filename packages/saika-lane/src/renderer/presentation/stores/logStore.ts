// SPDX-License-Identifier: MIT
import { create } from 'zustand';

import type { LogEntry } from '@/shared/types/log';

/**
 * Maximum number of log entries to retain
 */
const MAX_LOG_ENTRIES = 1000;

interface LogState {
  entries: LogEntry[];
  autoScroll: boolean;
}

interface LogActions {
  addEntry: (entry: LogEntry) => void;

  clearEntries: () => void;

  setAutoScroll: (autoScroll: boolean) => void;
}

const initialState: LogState = {
  entries: [],
  autoScroll: true,
};

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
