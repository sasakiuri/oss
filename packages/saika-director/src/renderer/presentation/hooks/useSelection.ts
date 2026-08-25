import { useCallback } from 'react';
import { useSelectionStore } from '../stores/ui/selection.store';

export function useSelection() {
  const selectedIds = useSelectionStore((state) => state.selectedIds);
  const toggleSelect = useSelectionStore((state) => state.toggleSelect);
  const selectAllRaw = useSelectionStore((state) => state.selectAll);
  const deselectAll = useSelectionStore((state) => state.deselectAll);
  const isSelected = useSelectionStore((state) => state.isSelected);

  const selectAll = useCallback((allIds: Map<string, unknown>) => selectAllRaw(allIds), [selectAllRaw]);

  return {
    selectedIds,
    toggleSelect,
    selectAll,
    deselectAll,
    isSelected,
  };
}
