import { useCallback } from 'react';
import { useLaneMoveStore } from '../stores/ui/modals.store';
interface MoveLanePayload {
  fromLaneId: string;
  toLaneId: string;
}
import { laneControlService } from '@/renderer/services';

export function useLaneMove() {
  const store = useLaneMoveStore();

  const moveLane = useCallback(async (payload: MoveLanePayload) => {
    store.setLoading(true);
    store.setError(null);
    try {
      const result = await laneControlService.moveLane({ fromLaneId: payload.fromLaneId, toLaneId: payload.toLaneId });
      if (!result.success) {
        store.setError(result.error?.message ?? 'Failed to move the Lane');
        return false;
      }
      return true;
    } catch (err) {
      store.setError(err instanceof Error ? err.message : 'Failed to move the Lane');
      return false;
    } finally {
      store.setLoading(false);
    }
  }, []);

  const openModal = useCallback((sourceLaneId: string, sourceLaneName: string, sourceChannel: number) => {
    store.openModal(sourceLaneId, sourceLaneName, sourceChannel);
  }, []);

  return {
    ...store,
    moveLane,
    openModal,
  };
}
