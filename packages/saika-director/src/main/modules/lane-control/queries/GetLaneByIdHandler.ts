import type { ILaneControlRepository } from '../domain/ILaneControlRepository';
import type { LaneControl } from '../domain/LaneControl';

export interface GetLaneByIdQuery {
  laneId: string;
}

export class GetLaneByIdHandler {
  constructor(private readonly repository: ILaneControlRepository) {}

  execute(query: GetLaneByIdQuery): LaneControl | undefined {
    return this.repository.findById(query.laneId);
  }
}
