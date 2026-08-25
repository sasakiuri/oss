import type { ILaneControlRepository } from '../domain/ILaneControlRepository';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import type { DeleteShotCommand } from './LaneCommands';
import { DomainError, ErrorCatalog } from '@/shared/errors';
import { emitLaneControlUpdated } from './helpers/emitLaneControlUpdated';

export class DeleteShotHandler {
  constructor(
    private readonly repository: ILaneControlRepository,
    private readonly eventBus: IEventBus,
  ) {}

  async execute(command: DeleteShotCommand): Promise<void> {
    const lane = this.repository.findById(command.laneId);
    if (!lane) {
      throw new DomainError(ErrorCatalog.LANE.NOT_FOUND, {
        messageOverride: `Lane ${command.laneId} not found`,
      });
    }

    const updated = lane.removeShot(command.shotIndex, command.shotType);
    this.repository.save(updated);

    emitLaneControlUpdated(this.eventBus, updated);
  }
}
