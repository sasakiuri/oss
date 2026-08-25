import type { Result } from './Result';

export interface IResultRepository {
  save(result: Result): void;
  replaceByCompetitionId(eventId: string, relayNumber: number, competitionId: string, results: Result[]): void;
  findById(id: string): Result | null;
  findByEventId(eventId: string): Result[];
  findByEventIdAndRelay(eventId: string, relayNumber: number): Result[];
  findByCompetitionId(eventId: string, relayNumber: number, competitionId: string): Result[];
  findByParticipantId(participantId: string): Result | null;
  deleteById(id: string): void;
  deleteByEventId(eventId: string): void;
  updateStatus(resultIds: string[], status: 'published' | 'confirmed'): void;
}
