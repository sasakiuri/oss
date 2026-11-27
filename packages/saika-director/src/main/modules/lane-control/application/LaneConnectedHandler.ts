import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { buildRoundConfig } from '@/shared/constants/roundConfig';
import { BR60S } from '@/shared/competitionTypes/definitions/BR60S';

import { Channel } from '../domain/Channel';
import type { ILaneControlRepository } from '../domain/ILaneControlRepository';
import { LaneControl } from '../domain/LaneControl';

import { emitLaneControlUpdated } from './commands/helpers/emitLaneControlUpdated';

const DEFAULT_QUALIFICATION_CONFIG = buildRoundConfig(BR60S);

/**
 * Keeps a lane control for each connected Lane: a known Lane follows its new channel when that
 * channel is free, and an unknown Lane on a free channel gets a Qualification lane control.
 */
export class LaneConnectedHandler {
  constructor(
    private readonly repository: ILaneControlRepository,
    private readonly eventBus: IEventBus,
  ) {}

  handle(event: { laneId: string; channel: number }): void {
    const existingById = this.repository.findById(event.laneId);
    if (existingById) {
      if (existingById.channel.value === event.channel) return;
      const occupied = this.repository.findByChannel(event.channel);
      if (occupied && occupied.id !== event.laneId) return;
      const moved = LaneControl.fromSnapshot({ ...existingById.toSnapshot(), channel: event.channel });
      this.repository.save(moved);
      emitLaneControlUpdated(this.eventBus, moved);
      return;
    }

    const existingByChannel = this.repository.findByChannel(event.channel);
    if (existingByChannel) return;
    const channel = Channel.create(event.channel);
    const lane = LaneControl.create(event.laneId, channel, DEFAULT_QUALIFICATION_CONFIG);
    this.repository.save(lane);
    emitLaneControlUpdated(this.eventBus, lane);
  }
}
