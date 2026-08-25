import type { FinalResult, FinalResultStatus } from './FinalResult';

export interface IFinalResultRepository {
  save(result: FinalResult): void;
  findById(id: string): FinalResult | undefined;
  findByEventId(eventId: string): FinalResult[];
  findByParticipantId(participantId: string): FinalResult | undefined;
  updateStatus(id: string, status: FinalResultStatus): void;
  delete(id: string): void;
  deleteByEventId(eventId: string): void;
  executeInTransaction(fn: () => void): void;
}
