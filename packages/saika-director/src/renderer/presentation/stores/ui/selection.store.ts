import { create } from 'zustand';
import { toggleInSet, selectAllFromMap, clearSelection } from '../utils';

interface SelectionState {
  selectedIds: Set<string>;

  toggleSelect: (id: string) => void;
  selectAll: (allIds: Map<string, unknown>) => void;
  deselectAll: () => void;
  isSelected: (id: string) => boolean;
  pruneSelection: (validIds: Map<string, unknown>) => void;
}

export const useSelectionStore = create<SelectionState>((set, get) => ({
  selectedIds: new Set(),

  toggleSelect: (id) =>
    set((state) => ({
      selectedIds: toggleInSet(state.selectedIds, id),
    })),

  selectAll: (allIds) =>
    set({
      selectedIds: selectAllFromMap(allIds),
    }),

  deselectAll: () => set({ selectedIds: clearSelection() }),

  isSelected: (id) => get().selectedIds.has(id),

  pruneSelection: (validIds) =>
    set((state) => ({
      selectedIds: new Set([...state.selectedIds].filter((id) => validIds.has(id))),
    })),
}));
