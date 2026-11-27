import type { ILaneControlRepository } from '../../domain/ILaneControlRepository';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import type { ClearCommand } from './LaneCommands';
import { emitLaneControlUpdated } from './helpers/emitLaneControlUpdated';
import { emitLanePhaseChanged } from './helpers/emitLanePhaseChanged';

export class ClearLanesHandler {
  constructor(
    private readonly repository: ILaneControlRepository,
    private readonly eventBus: IEventBus,
  ) {}

  async execute(command: ClearCommand): Promise<void> {
    for (const laneId of command.laneIds) {
      const lane = this.repository.findById(laneId);
      if (!lane) continue;

      const updated = lane.clearPlayer();
      this.repository.save(updated);

      emitLanePhaseChanged(this.eventBus, updated, 0);
      emitLaneControlUpdated(this.eventBus, updated);
    }
  }
}
