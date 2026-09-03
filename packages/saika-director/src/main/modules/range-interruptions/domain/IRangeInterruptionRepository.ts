import type { RangeInterruptionCase } from './RangeInterruptionCase';
import type { RangeInterruptionEntry } from './RangeInterruptionEntry';
import type { RangeInterruptionScopeLink, RangeInterruptionScopeType } from './RangeInterruptionScopeLink';
import type { TargetRecoveryAssessment } from './TargetRecoveryAssessment';
import type { RangeInterruptionCommandBatch } from './RangeInterruptionCommandBatch';
import type { QualificationTimedTargetRecoveryDecision } from './QualificationTimedTargetRecoveryDecision';

export interface RangeInterruptionScope {
  scopeType: RangeInterruptionScopeType;
  scopeId: string;
}

export interface IRangeInterruptionRepository {
  appendCase(interruption: RangeInterruptionCase, scopes: readonly RangeInterruptionScopeLink[]): void;
  findCaseById(id: string): RangeInterruptionCase | null;
  findAllCases(): RangeInterruptionCase[];
  findCasesByScope(scope: RangeInterruptionScope): RangeInterruptionCase[];
  appendScope(scope: RangeInterruptionScopeLink): void;
  findScopesByCaseIds(caseIds: readonly string[]): Map<string, RangeInterruptionScopeLink[]>;
  appendEntry(entry: RangeInterruptionEntry): void;
  findEntriesByCaseIds(caseIds: readonly string[]): Map<string, RangeInterruptionEntry[]>;
  appendTargetRecoveryAssessment(assessment: TargetRecoveryAssessment): void;
  findTargetRecoveryAssessmentsByCaseIds(caseIds: readonly string[]): Map<string, TargetRecoveryAssessment[]>;
  appendCommandBatch(batch: RangeInterruptionCommandBatch, transitionEntry?: RangeInterruptionEntry): void;
  findCommandBatchesByCaseIds(caseIds: readonly string[]): Map<string, RangeInterruptionCommandBatch[]>;
  appendQualificationTimedTargetRecoveryDecision(decision: QualificationTimedTargetRecoveryDecision): void;
  findQualificationTimedTargetRecoveryDecisionsByCaseIds(
    caseIds: readonly string[],
  ): Map<string, QualificationTimedTargetRecoveryDecision[]>;
  findActiveDataHolds(scope: RangeInterruptionScope, laneId?: string): RangeInterruptionCase[];
}
