import type { ILaneControlRepository } from '../domain/ILaneControlRepository';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import type { StartPreparationCommand } from './LaneCommands';
import { DomainError, ErrorCatalog } from '@/shared/errors';
import { Logger } from '@/shared/utils/Logger';
import { emitLaneControlUpdated } from './helpers/emitLaneControlUpdated';

const logger = Logger.create('StartPreparationHandler');

export class StartPreparationHandler {
  constructor(
    private readonly repository: ILaneControlRepository,
    private readonly eventBus: IEventBus,
  ) {}

  async execute(command: StartPreparationCommand): Promise<void> {
    const notFoundLaneIds: string[] = [];

    for (const laneId of command.laneIds) {
      const lane = this.repository.findById(laneId);
      if (!lane) {
        notFoundLaneIds.push(laneId);
        logger.warn(`Lane ${laneId} not found, skipping`);
        continue;
      }

      const updated = lane.startPreparation();
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
