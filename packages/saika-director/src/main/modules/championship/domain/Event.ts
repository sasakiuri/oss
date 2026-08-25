import { EventId } from './EventId';
import { ChampionshipId } from './ChampionshipId';
import { EventType } from './EventType';
import { Round } from '@/main/modules/lane-control';

export class Event {
  private constructor(
    public readonly id: EventId,
    public readonly championshipId: ChampionshipId,
    public readonly name: string,
    public readonly eventType: EventType,
    public readonly round: Round,
    public readonly sortOrder: number,
  ) {}

  static create(
    id: EventId,
    championshipId: ChampionshipId,
    name: string,
    eventType: EventType,
    round: Round,
    sortOrder: number = 0,
  ): Event {
    return new Event(id, championshipId, name, eventType, round, sortOrder);
  }

  static reconstruct(
    id: EventId,
    championshipId: ChampionshipId,
    name: string,
    eventType: EventType,
    round: Round,
    sortOrder: number,
  ): Event {
    return new Event(id, championshipId, name, eventType, round, sortOrder);
  }

  update(name: string, eventType: EventType, round: Round): Event {
    return new Event(this.id, this.championshipId, name, eventType, round, this.sortOrder);
  }
}
