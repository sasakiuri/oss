import type { LaneControl } from './LaneControl';

export interface ILaneControlRepository {
  save(laneControl: LaneControl): void;
  findById(id: string): LaneControl | undefined;
  findByChannel(channel: number): LaneControl | undefined;
  findAll(): LaneControl[];
  findActive(): LaneControl[];
  delete(id: string): void;
}
