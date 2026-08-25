import type { ILaneControlRepository } from '../domain/ILaneControlRepository';
import type { LaneControl } from '../domain/LaneControl';

export interface GetLaneByChannelQuery {
  channel: number;
}

export class GetLaneByChannelHandler {
  constructor(private readonly repository: ILaneControlRepository) {}

  execute(query: GetLaneByChannelQuery): LaneControl | undefined {
    return this.repository.findByChannel(query.channel);
  }
}
