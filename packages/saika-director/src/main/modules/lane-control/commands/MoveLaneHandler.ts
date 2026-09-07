import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { DomainError, ErrorCatalog } from '@/shared/errors';

import type { ILaneControlRepository } from '../domain/ILaneControlRepository';

import { emitLaneControlUpdated } from './helpers/emitLaneControlUpdated';
import type { MoveLaneCommand } from './LaneCommands';

export class MoveLaneHandler {
  constructor(
    private readonly repository: ILaneControlRepository,
    private readonly eventBus: IEventBus,
  ) {}

  async execute(command: MoveLaneCommand): Promise<void> {
    if (command.fromLaneId === command.toLaneId) {
      throw DomainError.from(ErrorCatalog.LANE.SAME_SOURCE_AND_TARGET, {
        laneId: command.fromLaneId,
      });
    }

    const fromLane = this.repository.findById(command.fromLaneId);
    const toLane = this.repository.findById(command.toLaneId);
    if (!fromLane || !toLane) return;

    if (!fromLane.player) {
      throw DomainError.from(ErrorCatalog.LANE.SOURCE_NO_PLAYER, {
        laneId: command.fromLaneId,
      });
    }
    if (toLane.player) {
      throw DomainError.from(ErrorCatalog.LANE.TARGET_NOT_EMPTY, {
        laneId: command.toLaneId,
      });
    }

    if (fromLane.phase !== 'IDLE' || toLane.phase !== 'IDLE') {
      throw new Error(
        'Use Reserve Lane transfer for a live competition; both Lanes must be IDLE for a local assignment move',
      );
    }

    const updatedTo = toLane.transferDataFrom(fromLane);
    const updatedFrom = fromLane.clearPlayer();

    this.repository.save(updatedTo);
    this.repository.save(updatedFrom);

    this.eventBus.emit({
      type: 'LaneMoved',
      timestamp: Date.now(),
      fromLaneId: command.fromLaneId,
      toLaneId: command.toLaneId,
      playerName: updatedTo.player?.name ?? '',
      channel: updatedTo.channel.value,
    });

    emitLaneControlUpdated(this.eventBus, updatedFrom);
    emitLaneControlUpdated(this.eventBus, updatedTo);
  }
}
