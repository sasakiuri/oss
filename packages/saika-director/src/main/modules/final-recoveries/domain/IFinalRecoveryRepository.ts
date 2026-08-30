import type { FinalRecoveryCase, FinalRecoveryEntry } from './FinalRecoveryCase';

export interface IFinalRecoveryRepository {
  appendCase(value: FinalRecoveryCase): void;
  appendEntry(value: FinalRecoveryEntry): void;
  findCaseById(id: string): FinalRecoveryCase | null;
  findCasesByCompetition(competitionId: string): FinalRecoveryCase[];
  findCasesByEvent(eventId: string): FinalRecoveryCase[];
  findEntries(caseIds: readonly string[]): Map<string, FinalRecoveryEntry[]>;
}
