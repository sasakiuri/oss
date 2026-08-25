import { useCallback } from 'react';
import { useLaneControlData } from './useLaneControlData';
import { useLaneControlActions } from './useLaneControlActions';
import { useSelection } from './useSelection';

export function useLaneControl() {
  const { lanesMap, lanes, getLaneById } = useLaneControlData();
  const actions = useLaneControlActions();
  const { selectedIds, toggleSelect, selectAll: selectAllRaw, deselectAll } = useSelection();

  const selectAll = useCallback(() => selectAllRaw(lanesMap), [selectAllRaw, lanesMap]);

  return {
    // State
    lanes,
    selectedIds,
    // Store actions
    setLanes: actions.setLanes,
    updateLane: actions.updateLane,
    toggleSelect,
    selectAll,
    deselectAll,
    clearLanesStore: actions.clearLanesStore,
    reset: actions.reset,
    getLaneById,
    // IPC actions
    loadState: actions.loadState,
    startPreparation: actions.startPreparation,
    advanceStage: actions.advanceStage,
    startSeries: actions.startSeries,
    finish: actions.finish,
    clearLanes: actions.clearLanes,
    assignPlayers: actions.assignPlayers,
    moveLane: actions.moveLane,
    editShot: actions.editShot,
    deleteShot: actions.deleteShot,
    insertShot: actions.insertShot,
    eliminate: actions.eliminate,
  };
}
