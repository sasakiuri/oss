import type { ILaneControlRepository } from '../../domain/ILaneControlRepository';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import type { StartSeriesCommand } from './LaneCommands';
import { emitLaneControlUpdated } from './helpers/emitLaneControlUpdated';
import { emitLanePhaseChanged } from './helpers/emitLanePhaseChanged';

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

      emitLanePhaseChanged(this.eventBus, updated);

      emitLaneControlUpdated(this.eventBus, updated);
    }
  }
}
