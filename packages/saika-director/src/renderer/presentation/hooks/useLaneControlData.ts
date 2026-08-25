import { useMemo } from 'react';
import { useLaneControlStore } from '../stores/domain/laneControl.store';
import type { LaneControlDto } from '../stores/domain/laneControl.store';

export function useLaneControlData() {
  const lanesMap = useLaneControlStore((state) => state.lanes);
  const getLaneById = useLaneControlStore((state) => state.getLaneById);

  const lanes: LaneControlDto[] = useMemo(() => Array.from(lanesMap.values()), [lanesMap]);

  return {
    lanesMap,
    lanes,
    getLaneById,
  };
}
