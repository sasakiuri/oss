import type { FinalRecoveryCase, FinalRecoveryEntry } from './FinalRecoveryCase';
import type { FinalRecoveryAllowanceSubject } from './FinalRecoveryAuthorizationPolicy';

export interface IFinalRecoveryRepository {
  executeInTransaction<T>(operation: () => T): T;
  appendAllowanceSubject(caseId: string, subject: FinalRecoveryAllowanceSubject): void;
  appendCase(value: FinalRecoveryCase): void;
  appendEntry(value: FinalRecoveryEntry): void;
  findCaseById(id: string): FinalRecoveryCase | null;
  findCasesByCompetition(competitionId: string): FinalRecoveryCase[];
  findCasesByEvent(eventId: string): FinalRecoveryCase[];
  findEntries(caseIds: readonly string[]): Map<string, FinalRecoveryEntry[]>;
}
