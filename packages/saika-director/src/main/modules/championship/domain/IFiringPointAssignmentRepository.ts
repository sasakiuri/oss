import type { FiringPointAssignment } from './FiringPointAssignment';

export interface IFiringPointAssignmentRepository {
  saveAll(assignments: FiringPointAssignment[]): void;
  findByEventId(eventId: string): FiringPointAssignment[];
  findByEventIdAndRelay(eventId: string, relayNumber: number): FiringPointAssignment[];
  deleteByEventId(eventId: string): void;
  executeInTransaction(fn: () => void): void;
}
