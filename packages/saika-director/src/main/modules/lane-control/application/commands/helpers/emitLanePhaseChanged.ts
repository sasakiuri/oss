import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import type { LaneControl } from '../../../domain/LaneControl';

export function emitLanePhaseChanged(
  eventBus: IEventBus,
  lane: LaneControl,
  remainingTime: number = lane.remainingTime,
): void {
  eventBus.emit({
    type: 'LanePhaseChanged',
    timestamp: Date.now(),
    laneId: lane.id,
    phase: lane.phase,
    stageIndex: lane.stageIndex,
    seriesIndex: lane.seriesIndex,
    remainingTime,
  });
}
