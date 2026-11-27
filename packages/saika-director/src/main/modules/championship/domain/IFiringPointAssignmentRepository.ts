import type { FiringPointAssignment } from './FiringPointAssignment';

export interface IFiringPointAssignmentRepository {
  saveAll(assignments: FiringPointAssignment[]): void;
  findByEventId(eventId: string): FiringPointAssignment[];
  findByEventIdAndRelay(eventId: string, relayNumber: number): FiringPointAssignment[];
  deleteByEventId(eventId: string): void;
  /** Replaces the event's whole firing-point plan in one transaction. */
  replaceByEventId(eventId: string, assignments: FiringPointAssignment[]): void;
}
