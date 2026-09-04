import type { QualificationMalfunctionCase, QualificationMalfunctionEntry } from './QualificationMalfunctionCase';

export interface IQualificationMalfunctionRepository {
  appendCase(value: QualificationMalfunctionCase): void;
  appendEntry(value: QualificationMalfunctionEntry): void;
  findCaseById(id: string): QualificationMalfunctionCase | null;
  findCasesByCompetition(competitionId: string): QualificationMalfunctionCase[];
  findCasesByEvent(eventId: string): QualificationMalfunctionCase[];
  findCasesByEventAndParticipant(eventId: string, participantId: string): QualificationMalfunctionCase[];
  findEntries(caseIds: readonly string[]): Map<string, QualificationMalfunctionEntry[]>;
  executeInTransaction<T>(work: () => T): T;
}
