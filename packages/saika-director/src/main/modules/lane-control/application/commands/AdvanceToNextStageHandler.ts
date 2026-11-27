import type { ILaneControlRepository } from '../../domain/ILaneControlRepository';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import type { AdvanceToNextStageCommand } from './LaneCommands';
import { emitLaneControlUpdated } from './helpers/emitLaneControlUpdated';
import { emitLanePhaseChanged } from './helpers/emitLanePhaseChanged';

export class AdvanceToNextStageHandler {
  constructor(
    private readonly repository: ILaneControlRepository,
    private readonly eventBus: IEventBus,
  ) {}

  async execute(command: AdvanceToNextStageCommand): Promise<void> {
    for (const laneId of command.laneIds) {
      const lane = this.repository.findById(laneId);
      if (!lane || !lane.canAdvanceToNextStage) continue;

      const updated = lane.advanceToNextStage();
      this.repository.save(updated);

      emitLanePhaseChanged(this.eventBus, updated);

      emitLaneControlUpdated(this.eventBus, updated);
    }
  }
}
