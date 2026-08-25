import type { ILaneControlRepository } from '../domain/ILaneControlRepository';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import type { StartSeriesCommand } from './LaneCommands';
import { emitLaneControlUpdated } from './helpers/emitLaneControlUpdated';

export class StartSeriesHandler {
  constructor(
    private readonly repository: ILaneControlRepository,
    private readonly eventBus: IEventBus,
  ) {}

  async execute(command: StartSeriesCommand): Promise<void> {
    for (const laneId of command.laneIds) {
      const lane = this.repository.findById(laneId);
      if (!lane || !lane.canStartMatch) continue;

      const updated = lane.startMatch();
      this.repository.save(updated);

      this.eventBus.emit({
        type: 'LanePhaseChanged',
        timestamp: Date.now(),
        laneId,
        phase: updated.phase,
        stageIndex: updated.stageIndex,
        seriesIndex: updated.seriesIndex,
        remainingTime: updated.remainingTime,
      });

      emitLaneControlUpdated(this.eventBus, updated);
    }
  }
}
