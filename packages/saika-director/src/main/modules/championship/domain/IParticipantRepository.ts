import type { Participant } from './Participant';

export interface IParticipantRepository {
  save(participant: Participant): void;
  saveAll(participants: Participant[]): void;
  findById(id: string): Participant | null;
  findByEventId(eventId: string): Participant[];
  delete(id: string): void;
  deleteByEventId(eventId: string): void;
  executeInTransaction(fn: () => void): void;
}
