import type { ILaneControlRepository } from '../domain/ILaneControlRepository';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { emitLaneControlUpdated } from './helpers/emitLaneControlUpdated';

export interface AddLaneShootoffShotCommand {
  laneId: string;
  score: number;
}

export class AddLaneShootoffShotHandler {
  constructor(
    private readonly repository: ILaneControlRepository,
    private readonly eventBus: IEventBus,
  ) {}

  async execute(command: AddLaneShootoffShotCommand): Promise<void> {
    const lane = this.repository.findById(command.laneId);
    if (!lane) return;

    const updated = lane.addShootoffShot(command.score);
    this.repository.save(updated);
    emitLaneControlUpdated(this.eventBus, updated);
  }
}
