import type { ILaneControlRepository } from '../domain/ILaneControlRepository';
import type { LaneControl } from '../domain/LaneControl';

export class GetAllLanesHandler {
  constructor(private readonly repository: ILaneControlRepository) {}

  execute(): LaneControl[] {
    return this.repository.findAll();
  }
}
