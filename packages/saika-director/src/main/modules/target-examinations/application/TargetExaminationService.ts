import type {
  AddTargetExaminationEvidencePayload,
  AppendTargetExaminationEntryPayload,
  CreateTargetExaminationCasePayload,
  LinkTargetExaminationScopePayload,
  TargetExaminationCaseDto,
  TargetExaminationEntryDto,
  TargetExaminationEvidenceDto,
  TargetExaminationScopeDto,
  TargetExaminationScopePayload,
} from '@/shared/ipc/contracts';

import type { ITargetExaminationRepository } from '../domain/ITargetExaminationRepository';
import type { ITargetExaminationWorkflowPolicy } from '../domain/ITargetExaminationWorkflowPolicy';
import { IssfTargetExaminationWorkflowPolicy } from '../domain/IssfTargetExaminationWorkflowPolicy';
import { TargetExaminationCase } from '../domain/TargetExaminationCase';
import {
  getTargetExaminationState,
  TargetExaminationEntry,
  type TargetExaminationState,
} from '../domain/TargetExaminationEntry';
import { TargetExaminationEvidence } from '../domain/TargetExaminationEvidence';
import { TargetExaminationScopeLink } from '../domain/TargetExaminationScopeLink';

/** Coordinates the independent, append-only EST examination and evidence-hold ledger. */
export class TargetExaminationService {
  constructor(
    private readonly repository: ITargetExaminationRepository,
    private readonly workflowPolicy: ITargetExaminationWorkflowPolicy = new IssfTargetExaminationWorkflowPolicy(),
  ) {}

  async listAll(): Promise<TargetExaminationCaseDto[]> {
    return this.projectCases(this.repository.findAllCases());
  }

  async listByScope(scope: TargetExaminationScopePayload): Promise<TargetExaminationCaseDto[]> {
    return this.projectCases(this.repository.findCasesByScope(scope));
  }

  async getById(caseId: string): Promise<TargetExaminationCaseDto> {
    const examination = this.requireCase(caseId);
    return this.projectCases([examination])[0]!;
  }

  async create(input: CreateTargetExaminationCasePayload): Promise<TargetExaminationCaseDto> {
    return this.createNow(input);
  }

  /** Synchronous variant used when a caller owns the surrounding SQLite transaction. */
  createNow(input: CreateTargetExaminationCasePayload): TargetExaminationCaseDto {
    validateUniqueScopes(input.scopes);
    const examination = TargetExaminationCase.create({
      ...input,
      occurredAt: new Date(input.occurredAt),
    });
    const scopes = input.scopes.map((scope) =>
      TargetExaminationScopeLink.create({
        caseId: examination.id,
        ...scope,
        linkedBy: input.openedBy,
        note: 'Linked when the target examination was opened',
      }),
    );
    this.repository.appendCase(examination, scopes);
    return toDto(examination, scopes, [], [], this.workflowPolicy);
  }

  async linkScope(input: LinkTargetExaminationScopePayload): Promise<TargetExaminationCaseDto> {
    this.requireChangeableCase(input.caseId, { allowClosed: true });
    const existing = this.repository.findScopesByCaseIds([input.caseId]).get(input.caseId) ?? [];
    if (existing.some((scope) => scope.scopeType === input.scope.scopeType && scope.scopeId === input.scope.scopeId)) {
      throw new Error('This scope is already linked to the target examination');
    }
    const scope = TargetExaminationScopeLink.create({
      caseId: input.caseId,
      ...input.scope,
      linkedBy: input.linkedBy,
      note: input.note,
    });
    this.repository.appendScope(scope);
    return this.getById(input.caseId);
  }

  async addEvidence(input: AddTargetExaminationEvidencePayload): Promise<TargetExaminationCaseDto> {
    this.requireChangeableCase(input.caseId);
    const evidence = TargetExaminationEvidence.create({
      ...input,
      collectedAt: new Date(input.collectedAt),
    });
    this.repository.appendEvidence(evidence);
    return this.getById(input.caseId);
  }

  async appendEntry(input: AppendTargetExaminationEntryPayload): Promise<TargetExaminationCaseDto> {
    const { state } = this.requireChangeableCase(input.caseId, {
      allowClosed: input.type === 'REOPENED' || input.type === 'VOID',
    });
    validateTransition(input.type, state);
    const entry = TargetExaminationEntry.create({
      ...input,
      ruleReference:
        input.type === 'HOLD_RELEASED' && input.ruleReference === undefined ? 'ISSF 6.10.8.3' : input.ruleReference,
    });
    this.repository.appendEntry(entry);
    return this.getById(input.caseId);
  }

  private requireCase(caseId: string): TargetExaminationCase {
    const examination = this.repository.findCaseById(caseId);
    if (!examination) throw new Error(`Target examination ${caseId} not found`);
    return examination;
  }

  private requireChangeableCase(
    caseId: string,
    options: { allowClosed?: boolean } = {},
  ): { examination: TargetExaminationCase; entries: TargetExaminationEntry[]; state: TargetExaminationState } {
    const examination = this.requireCase(caseId);
    const entries = this.repository.findEntriesByCaseIds([caseId]).get(caseId) ?? [];
    const state = getTargetExaminationState(entries);
    if (state.status === 'VOID') throw new Error('A voided target examination cannot be changed');
    if (state.status === 'CLOSED' && !options.allowClosed) {
      throw new Error('A closed target examination must be reopened before it can be changed');
    }
    return { examination, entries, state };
  }

  private projectCases(examinations: readonly TargetExaminationCase[]): TargetExaminationCaseDto[] {
    const ids = examinations.map((examination) => examination.id);
    const scopes = this.repository.findScopesByCaseIds(ids);
    const evidence = this.repository.findEvidenceByCaseIds(ids);
    const entries = this.repository.findEntriesByCaseIds(ids);
    return examinations.map((examination) => {
      const examinationEvidence = evidence.get(examination.id) ?? [];
      const examinationEntries = entries.get(examination.id) ?? [];
      return toDto(
        examination,
        scopes.get(examination.id) ?? [],
        examinationEvidence,
        examinationEntries,
        this.workflowPolicy,
      );
    });
  }
}

function validateUniqueScopes(scopes: readonly TargetExaminationScopePayload[]): void {
  const keys = scopes.map((scope) => `${scope.scopeType}:${scope.scopeId}`);
  if (new Set(keys).size !== keys.length) throw new Error('Target examination scopes must be unique');
}

function validateTransition(type: AppendTargetExaminationEntryPayload['type'], state: TargetExaminationState): void {
  switch (type) {
    case 'HOLD_RELEASED':
      if (!state.evidenceHoldActive) throw new Error('The evidence hold has already been released');
      break;
    case 'HOLD_REINSTATED':
      if (state.evidenceHoldActive) throw new Error('The evidence hold is already active');
      break;
    case 'CLOSED':
      if (state.evidenceHoldActive) throw new Error('Release the evidence hold before closing the examination');
      break;
    case 'REOPENED':
      if (state.status !== 'CLOSED') throw new Error('Only a closed target examination can be reopened');
      break;
    case 'NOTE':
    case 'DECISION':
    case 'VOID':
      break;
  }
}

function toDto(
  examination: TargetExaminationCase,
  scopes: readonly TargetExaminationScopeLink[],
  evidence: readonly TargetExaminationEvidence[],
  entries: readonly TargetExaminationEntry[],
  workflowPolicy: ITargetExaminationWorkflowPolicy,
): TargetExaminationCaseDto {
  const state = getTargetExaminationState(entries);
  const workflow = workflowPolicy.evaluate(examination, evidence, entries);
  return {
    id: examination.id,
    issueKind: examination.issueKind,
    occurredAt: examination.occurredAt.toISOString(),
    laneId: examination.laneId,
    firingPointNumber: examination.firingPointNumber,
    relayNumber: examination.relayNumber,
    athleteName: examination.athleteName,
    shotId: examination.shotId,
    summary: examination.summary,
    details: examination.details,
    ruleReferences: examination.ruleReferences,
    openedBy: examination.openedBy,
    createdAt: examination.createdAt.toISOString(),
    scopes: scopes.map(toScopeDto),
    evidence: evidence.map(toEvidenceDto),
    entries: entries.map(toEntryDto),
    workflow: { ...workflow, steps: [...workflow.steps] },
    ...state,
  };
}

function toScopeDto(scope: TargetExaminationScopeLink): TargetExaminationScopeDto {
  return {
    id: scope.id,
    caseId: scope.caseId,
    scopeType: scope.scopeType,
    scopeId: scope.scopeId,
    linkedBy: scope.linkedBy,
    note: scope.note,
    linkedAt: scope.linkedAt.toISOString(),
  };
}

function toEvidenceDto(evidence: TargetExaminationEvidence): TargetExaminationEvidenceDto {
  return {
    id: evidence.id,
    caseId: evidence.caseId,
    type: evidence.type,
    description: evidence.description,
    reference: evidence.reference,
    contentHashSha256: evidence.contentHashSha256,
    collectedBy: evidence.collectedBy,
    collectedAt: evidence.collectedAt.toISOString(),
    recordedAt: evidence.recordedAt.toISOString(),
  };
}

function toEntryDto(entry: TargetExaminationEntry): TargetExaminationEntryDto {
  return {
    id: entry.id,
    caseId: entry.caseId,
    type: entry.type,
    statement: entry.statement,
    ruleReference: entry.ruleReference,
    officialName: entry.officialName,
    recordedAt: entry.recordedAt.toISOString(),
  };
}
