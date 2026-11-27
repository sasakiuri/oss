import type { IRangeInterruptionRepository } from '../domain/IRangeInterruptionRepository';
import type { QualificationTimedTargetRecoveryDecision } from '../domain/QualificationTimedTargetRecoveryDecision';
import { getRangeInterruptionState } from '../domain/RangeInterruptionEntry';

const ACTIONS = {
  execution: { verb: 'execute', participle: 'executed' },
  settlement: { verb: 'settle', participle: 'settled' },
} as const;

/** Throws unless the competition is linked to the interruption. */
export function assertCompetitionLinked(
  repository: IRangeInterruptionRepository,
  caseId: string,
  competitionId: string,
): void {
  const scopes = repository.findScopesByCaseIds([caseId]).get(caseId) ?? [];
  if (!scopes.some((scope) => scope.scopeType === 'COMPETITION' && scope.scopeId === competitionId)) {
    throw new Error(`Competition ${competitionId} is not linked to range interruption ${caseId}`);
  }
}

/**
 * Returns the interruption's latest Qualification recovery decision when `decisionId` names it and the
 * ended interruption remains open, so that the decision can be carried out by an execution or a settlement.
 */
export function requireLatestQualificationRecoveryDecision(
  repository: IRangeInterruptionRepository,
  caseId: string,
  decisionId: string,
  action: keyof typeof ACTIONS,
): QualificationTimedTargetRecoveryDecision {
  const { verb, participle } = ACTIONS[action];
  const state = getRangeInterruptionState(repository.findEntriesByCaseIds([caseId]).get(caseId) ?? []);
  if (state.status !== 'ENDED') {
    throw new Error(`Qualification recovery can only ${verb} while the ended interruption remains open`);
  }
  const decisions = repository.findQualificationTimedTargetRecoveryDecisionsByCaseIds([caseId]).get(caseId) ?? [];
  const decision = decisions.at(-1);
  if (!decision) throw new Error(`Record an official Qualification recovery decision before ${action}`);
  if (decision.id !== decisionId) {
    throw new Error(`Only the latest Qualification recovery decision ${decision.id} can be ${participle}`);
  }
  return decision;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
