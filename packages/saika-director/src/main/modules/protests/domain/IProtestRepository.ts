import type { ProtestCase, ProtestScopeType } from './ProtestCase';
import type { ProtestEntry } from './ProtestEntry';

export interface IProtestRepository {
  appendCase(protest: ProtestCase): void;
  appendEntry(entry: ProtestEntry): void;
  findCaseById(id: string): ProtestCase | null;
  findCasesByScope(scopeType: ProtestScopeType, scopeId: string): ProtestCase[];
  findEntries(caseIds: readonly string[]): Map<string, ProtestEntry[]>;
}
