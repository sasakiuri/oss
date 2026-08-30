import type { TargetExaminationCase } from './TargetExaminationCase';
import type { TargetExaminationEntry } from './TargetExaminationEntry';
import type { TargetExaminationEvidence } from './TargetExaminationEvidence';
import type { TargetExaminationScopeLink, TargetExaminationScopeType } from './TargetExaminationScopeLink';

export interface TargetExaminationScope {
  scopeType: TargetExaminationScopeType;
  scopeId: string;
}

export interface ITargetExaminationRepository {
  appendCase(examination: TargetExaminationCase, scopes: readonly TargetExaminationScopeLink[]): void;
  findCaseById(id: string): TargetExaminationCase | null;
  findAllCases(): TargetExaminationCase[];
  findCasesByScope(scope: TargetExaminationScope): TargetExaminationCase[];
  appendScope(scope: TargetExaminationScopeLink): void;
  findScopesByCaseIds(caseIds: readonly string[]): Map<string, TargetExaminationScopeLink[]>;
  appendEvidence(evidence: TargetExaminationEvidence): void;
  findEvidenceByCaseIds(caseIds: readonly string[]): Map<string, TargetExaminationEvidence[]>;
  appendEntry(entry: TargetExaminationEntry): void;
  findEntriesByCaseIds(caseIds: readonly string[]): Map<string, TargetExaminationEntry[]>;
  findActiveEvidenceHolds(scope: TargetExaminationScope, laneId?: string): TargetExaminationCase[];
}
