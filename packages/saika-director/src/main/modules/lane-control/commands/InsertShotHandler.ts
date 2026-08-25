import type { ILaneControlRepository } from '../domain/ILaneControlRepository';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import type { InsertShotCommand } from './LaneCommands';
import { emitLaneControlUpdated } from './helpers/emitLaneControlUpdated';

export class InsertShotHandler {
  constructor(
    private readonly repository: ILaneControlRepository,
    private readonly eventBus: IEventBus,
  ) {}

  async execute(command: InsertShotCommand): Promise<void> {
    const lane = this.repository.findById(command.laneId);
    if (!lane) return;

    const updated = lane.insertShot(command.shotIndex, command.score, command.shotType);
    this.repository.save(updated);

    emitLaneControlUpdated(this.eventBus, updated);
  }
}
