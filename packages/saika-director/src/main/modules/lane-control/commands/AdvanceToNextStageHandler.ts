import type { ILaneControlRepository } from '../domain/ILaneControlRepository';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import type { AdvanceToNextStageCommand } from './LaneCommands';
import { emitLaneControlUpdated } from './helpers/emitLaneControlUpdated';

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
