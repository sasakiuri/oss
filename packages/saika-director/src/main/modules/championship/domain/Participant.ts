import { ParticipantId } from './ParticipantId';
import { EventId } from './EventId';

export class Participant {
  private constructor(
    public readonly id: ParticipantId,
    public readonly eventId: EventId,
    public readonly playerName: string,
    public readonly affiliation: string,
    public readonly logoPath: string | null,
    public readonly sortOrder: number,
  ) {}

  static create(
    id: ParticipantId,
    eventId: EventId,
    playerName: string,
    affiliation: string,
    logoPath: string | null = null,
    sortOrder: number = 0,
  ): Participant {
    if (!playerName.trim()) {
      throw new Error('Player name cannot be empty');
    }
    return new Participant(id, eventId, playerName.trim(), affiliation.trim(), logoPath, sortOrder);
  }

  static reconstruct(
    id: ParticipantId,
    eventId: EventId,
    playerName: string,
    affiliation: string,
    logoPath: string | null,
    sortOrder: number,
  ): Participant {
    return new Participant(id, eventId, playerName, affiliation, logoPath, sortOrder);
  }
}
