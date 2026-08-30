import type {
  AdjudicationCase,
  AdjudicationCaseEntry,
  AdjudicationCaseLink,
  AdjudicationCaseScopeType,
} from './AdjudicationCase';

export interface IAdjudicationCaseRepository {
  appendCase(value: AdjudicationCase): void;
  appendEntry(value: AdjudicationCaseEntry): void;
  appendLink(value: AdjudicationCaseLink): void;
  findCaseById(id: string): AdjudicationCase | null;
  findCasesByScope(scopeType: AdjudicationCaseScopeType, scopeId: string): AdjudicationCase[];
  findEntries(caseIds: readonly string[]): Map<string, AdjudicationCaseEntry[]>;
  findLinks(caseIds: readonly string[]): Map<string, AdjudicationCaseLink[]>;
}
