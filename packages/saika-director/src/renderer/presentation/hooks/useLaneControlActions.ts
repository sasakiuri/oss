import { useCallback } from 'react';
import { useLaneControlStore } from '../stores/domain/laneControl.store';
import { laneControlService } from '@/renderer/services';
import { useSelectionStore } from '../stores/ui/selection.store';
import { mapResponseToLaneControlDto } from '@/renderer/services/mappers/laneControlMapper';

export function useLaneControlActions() {
  const setLanes = useLaneControlStore((state) => state.setLanes);
  const updateLane = useLaneControlStore((state) => state.updateLane);
  const clearLanesStoreRaw = useLaneControlStore((state) => state.clearLanes);
  const resetRaw = useLaneControlStore((state) => state.reset);

  const clearLanesStore = useCallback(() => {
    clearLanesStoreRaw();
    useSelectionStore.getState().deselectAll();
  }, [clearLanesStoreRaw]);

  const reset = useCallback(() => {
    resetRaw();
    useSelectionStore.getState().deselectAll();
  }, [resetRaw]);

  const loadState = useCallback(async () => {
    const response = await laneControlService.getAll();
    if (response.success && Array.isArray(response.data)) {
      const dtos = (response.data as Array<Record<string, unknown>>).map(mapResponseToLaneControlDto);
      setLanes(dtos);
      const newMap = useLaneControlStore.getState().lanes;
      useSelectionStore.getState().pruneSelection(newMap);
    }
  }, [setLanes]);

  const startPreparation = useCallback(
    async (laneIds: string[]) => {
      const result = await laneControlService.startPreparation({ laneIds });
      if (result.success) await loadState();
      return result;
    },
    [loadState],
  );

  const advanceStage = useCallback(
    async (laneIds: string[]) => {
      const result = await laneControlService.advanceStage({ laneIds });
      if (result.success) await loadState();
      return result;
    },
    [loadState],
  );

  const startSeries = useCallback(
    async (laneIds: string[]) => {
      const result = await laneControlService.startSeries({ laneIds });
      if (result.success) await loadState();
      return result;
    },
    [loadState],
  );

  const finish = useCallback(
    async (laneIds: string[]) => {
      const result = await laneControlService.finish({ laneIds });
      if (result.success) await loadState();
      return result;
    },
    [loadState],
  );

  const clearLanes = useCallback(
    async (laneIds: string[]) => {
      const result = await laneControlService.clear({ laneIds });
      if (result.success) await loadState();
      return result;
    },
    [loadState],
  );

  const assignPlayers = useCallback(
    async (payload: {
      eventType: string;
      assignments: Array<{
        channel: number;
        playerName: string;
        affiliation: string;
        participantId?: string;
        logoPath?: string;
        relayNumber?: number;
      }>;
    }) => {
      const result = await laneControlService.assignPlayers(payload);
      if (result.success) await loadState();
      return result;
    },
    [loadState],
  );

  const moveLane = useCallback(
    async (fromLaneId: string, toLaneId: string) => {
      const result = await laneControlService.moveLane({ fromLaneId, toLaneId });
      if (result.success) await loadState();
      return result;
    },
    [loadState],
  );

  const editShot = useCallback(
    async (payload: { laneId: string; shotIndex: number; newScore: number; shotType: 'PREPARATION' | 'MATCH' }) => {
      const result = await laneControlService.editShot(payload);
      if (result.success) await loadState();
      return result;
    },
    [loadState],
  );

  const deleteShot = useCallback(
    async (payload: { laneId: string; shotIndex: number; shotType: 'PREPARATION' | 'MATCH' }) => {
      const result = await laneControlService.deleteShot(payload);
      if (result.success) await loadState();
      return result;
    },
    [loadState],
  );

  const insertShot = useCallback(
    async (payload: { laneId: string; shotIndex: number; score: number; shotType: 'PREPARATION' | 'MATCH' }) => {
      const result = await laneControlService.insertShot(payload);
      if (result.success) await loadState();
      return result;
    },
    [loadState],
  );

  const eliminate = useCallback(
    async (laneId: string, rank: number) => {
      const result = await laneControlService.eliminate({ laneId, rank });
      if (result.success) await loadState();
      return result;
    },
    [loadState],
  );

  return {
    // Store actions
    setLanes,
    updateLane,
    clearLanesStore,
    reset,
    // IPC actions
    loadState,
    startPreparation,
    advanceStage,
    startSeries,
    finish,
    clearLanes,
    assignPlayers,
    moveLane,
    editShot,
    deleteShot,
    insertShot,
    eliminate,
  };
}
