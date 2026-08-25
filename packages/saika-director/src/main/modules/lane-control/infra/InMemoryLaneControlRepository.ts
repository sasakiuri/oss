import type { LaneControl } from '../domain/LaneControl';
import type { ILaneControlRepository } from '../domain/ILaneControlRepository';

export class InMemoryLaneControlRepository implements ILaneControlRepository {
  private lanes = new Map<string, LaneControl>();

  save(laneControl: LaneControl): void {
    this.lanes.set(laneControl.id, laneControl);
  }

  findById(id: string): LaneControl | undefined {
    return this.lanes.get(id);
  }

  findByChannel(channel: number): LaneControl | undefined {
    for (const lane of this.lanes.values()) {
      if (lane.channel.value === channel) {
        return lane;
      }
    }
    return undefined;
  }

  findAll(): LaneControl[] {
    return Array.from(this.lanes.values());
  }

  findActive(): LaneControl[] {
    return Array.from(this.lanes.values()).filter((lane) => lane.phase !== 'IDLE' && lane.phase !== 'FINISHED');
  }

  delete(id: string): void {
    this.lanes.delete(id);
  }
}
