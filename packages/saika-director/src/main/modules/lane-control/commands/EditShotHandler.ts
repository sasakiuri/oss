import type { ILaneControlRepository } from '../domain/ILaneControlRepository';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import type { EditShotCommand } from './LaneCommands';
import { DomainError, ErrorCatalog } from '@/shared/errors';
import { emitLaneControlUpdated } from './helpers/emitLaneControlUpdated';

export class EditShotHandler {
  constructor(
    private readonly repository: ILaneControlRepository,
    private readonly eventBus: IEventBus,
  ) {}

  async execute(command: EditShotCommand): Promise<void> {
    const lane = this.repository.findById(command.laneId);
    if (!lane) {
      throw new DomainError(ErrorCatalog.LANE.NOT_FOUND, {
        messageOverride: `Lane ${command.laneId} not found`,
      });
    }

    const updated = lane.updateShot(command.shotIndex, command.newScore, command.shotType);
    this.repository.save(updated);

    emitLaneControlUpdated(this.eventBus, updated);
  }
}
