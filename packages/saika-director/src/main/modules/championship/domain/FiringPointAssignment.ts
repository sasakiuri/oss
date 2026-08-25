import { FiringPointAssignmentId } from './FiringPointAssignmentId';
import { EventId } from './EventId';
import { ParticipantId } from './ParticipantId';

export class FiringPointAssignment {
  private constructor(
    public readonly id: FiringPointAssignmentId,
    public readonly eventId: EventId,
    public readonly relayNumber: number,
    public readonly firingPointNumber: number,
    public readonly participantId: ParticipantId,
  ) {}

  static create(
    id: FiringPointAssignmentId,
    eventId: EventId,
    relayNumber: number,
    firingPointNumber: number,
    participantId: ParticipantId,
  ): FiringPointAssignment {
    if (!Number.isInteger(relayNumber) || relayNumber < 1) {
      throw new Error(`Relay number must be a positive integer, got: ${relayNumber}`);
    }
    if (!Number.isInteger(firingPointNumber) || firingPointNumber < 1) {
      throw new Error(`Firing point number must be a positive integer, got: ${firingPointNumber}`);
    }
    return new FiringPointAssignment(id, eventId, relayNumber, firingPointNumber, participantId);
  }

  static reconstruct(
    id: FiringPointAssignmentId,
    eventId: EventId,
    relayNumber: number,
    firingPointNumber: number,
    participantId: ParticipantId,
  ): FiringPointAssignment {
    return new FiringPointAssignment(id, eventId, relayNumber, firingPointNumber, participantId);
  }
}
