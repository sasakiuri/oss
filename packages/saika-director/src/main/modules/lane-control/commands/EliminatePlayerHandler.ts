import type { ILaneControlRepository } from '../domain/ILaneControlRepository';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import type { EliminatePlayerCommand } from './LaneCommands';
import { emitLaneControlUpdated } from './helpers/emitLaneControlUpdated';

export class EliminatePlayerHandler {
  constructor(
    private readonly repository: ILaneControlRepository,
    private readonly eventBus: IEventBus,
  ) {}

  async execute(command: EliminatePlayerCommand): Promise<void> {
    const lane = this.repository.findById(command.laneId);
    if (!lane) return;

    const updated = lane.eliminate(command.rank);
    this.repository.save(updated);

    emitLaneControlUpdated(this.eventBus, updated);
  }
}
