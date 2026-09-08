import type { ProtestCase, ProtestScopeType } from './ProtestCase';
import type { ProtestEntry } from './ProtestEntry';

export interface IProtestRepository {
  appendCase(protest: ProtestCase): void;
  appendEntry(entry: ProtestEntry): void;
  findCaseById(id: string): ProtestCase | null;
  findCasesByScope(scopeType: ProtestScopeType, scopeId: string): ProtestCase[];
  /** Return each case's history in append order, independent of the entered occurrence time. */
  findEntries(caseIds: readonly string[]): Map<string, ProtestEntry[]>;
}
