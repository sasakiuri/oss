import type { ILaneControlRepository } from '../domain/ILaneControlRepository';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { emitLaneControlUpdated } from './helpers/emitLaneControlUpdated';

export interface ResolveLaneShootoffCommand {
  laneId: string;
}

export class ResolveLaneShootoffHandler {
  constructor(
    private readonly repository: ILaneControlRepository,
    private readonly eventBus: IEventBus,
  ) {}

  async execute(command: ResolveLaneShootoffCommand): Promise<void> {
    const lane = this.repository.findById(command.laneId);
    if (!lane) return;

    const updated = lane.resolveShootoff();
    this.repository.save(updated);
    emitLaneControlUpdated(this.eventBus, updated);
  }
}
