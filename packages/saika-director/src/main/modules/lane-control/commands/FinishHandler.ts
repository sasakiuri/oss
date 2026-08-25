import type { ILaneControlRepository } from '../domain/ILaneControlRepository';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import type { FinishCommand } from './LaneCommands';
import { DomainError, ErrorCatalog } from '@/shared/errors';
import { Logger } from '@/shared/utils/Logger';
import { emitLaneControlUpdated } from './helpers/emitLaneControlUpdated';

const logger = Logger.create('FinishHandler');

export class FinishHandler {
  constructor(
    private readonly repository: ILaneControlRepository,
    private readonly eventBus: IEventBus,
  ) {}

  async execute(command: FinishCommand): Promise<void> {
    const notFoundLaneIds: string[] = [];

    for (const laneId of command.laneIds) {
      const lane = this.repository.findById(laneId);
      if (!lane) {
        notFoundLaneIds.push(laneId);
        logger.warn(`Lane ${laneId} not found, skipping`);
        continue;
      }

      if (!lane.canFinish) {
        logger.warn(`Lane ${laneId} cannot finish in current state, skipping`);
        continue;
      }

      const updated = lane.finish();
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

    if (notFoundLaneIds.length === command.laneIds.length) {
      throw new DomainError(ErrorCatalog.LANE.NOT_FOUND, {
        messageOverride: `None of the specified lanes were found: ${notFoundLaneIds.join(', ')}`,
      });
    }
  }
}
