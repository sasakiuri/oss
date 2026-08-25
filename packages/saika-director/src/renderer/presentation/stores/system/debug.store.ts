import { create } from 'zustand';
import type { DebugLogEntry } from '@/shared/ipc/contracts/debug.contract';
import { addWithLimit, addManyWithLimit } from '../utils';

export type DebugTab = 'ALL' | 'TX' | 'RX' | 'LOG';

interface DebugState {
  entries: DebugLogEntry[];
  isVisible: boolean;
  activeTab: DebugTab;

  addEntry: (entry: DebugLogEntry) => void;
  setEntries: (entries: DebugLogEntry[]) => void;
  toggleVisibility: () => void;
  setActiveTab: (tab: DebugTab) => void;
  clear: () => void;
}

const MAX_ENTRIES = 200; // Keep fewer entries in renderer for performance

export const useDebugStore = create<DebugState>((set) => ({
  entries: [],
  isVisible: false,
  activeTab: 'ALL',

  addEntry: (entry) =>
    set((state) => ({
      entries: addWithLimit(state.entries, entry, MAX_ENTRIES),
    })),
  setEntries: (entries) => set({ entries: addManyWithLimit([], entries, MAX_ENTRIES) }),
  toggleVisibility: () => set((state) => ({ isVisible: !state.isVisible })),
  setActiveTab: (tab) => set({ activeTab: tab }),
  clear: () => set({ entries: [] }),
}));
