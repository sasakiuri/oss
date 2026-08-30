import type {
  AdjudicationCaseDto,
  AdjudicationCaseScopePayload,
  AppendAdjudicationCaseEntryPayload,
  CreateAdjudicationCasePayload,
  LinkAdjudicationArtifactPayload,
  UnlinkAdjudicationArtifactPayload,
} from '@/shared/ipc/contracts';

import type { IAdjudicationCaseRepository } from '../domain/IAdjudicationCaseRepository';
import {
  AdjudicationCase,
  AdjudicationCaseEntry,
  AdjudicationCaseLink,
  activeAdjudicationLinks,
  adjudicationCaseStatus,
  type AdjudicationCaseStatus,
} from '../domain/AdjudicationCase';

export class AdjudicationCaseService {
  constructor(private readonly repository: IAdjudicationCaseRepository) {}

  list(input: AdjudicationCaseScopePayload): AdjudicationCaseDto[] {
    return this.project(this.repository.findCasesByScope(input.scopeType, input.scopeId));
  }

  create(input: CreateAdjudicationCasePayload): AdjudicationCaseDto {
    const value = AdjudicationCase.create({
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      category: input.category,
      subject: input.subject,
      summary: input.summary,
      openedBy: input.openedBy,
      ...(input.openedAt ? { openedAt: new Date(input.openedAt) } : {}),
    });
    this.repository.appendCase(value);
    return this.project([value])[0]!;
  }

  appendEntry(input: AppendAdjudicationCaseEntryPayload): AdjudicationCaseDto {
    const value = this.requireCase(input.caseId);
    const entries = this.repository.findEntries([value.id]).get(value.id) ?? [];
    assertEntryTransition(adjudicationCaseStatus(entries), input.type);
    this.repository.appendEntry(
      AdjudicationCaseEntry.create({
        caseId: input.caseId,
        type: input.type,
        statement: input.statement,
        officialName: input.officialName,
        ...(input.ruleReference ? { ruleReference: input.ruleReference } : {}),
        ...(input.occurredAt ? { occurredAt: new Date(input.occurredAt) } : {}),
      }),
    );
    return this.project([value])[0]!;
  }

  linkArtifact(input: LinkAdjudicationArtifactPayload): AdjudicationCaseDto {
    const value = this.requireCase(input.caseId);
    this.assertLinksEditable(value.id);
    const history = this.repository.findLinks([value.id]).get(value.id) ?? [];
    const duplicate = activeAdjudicationLinks(history).some(
      (link) =>
        link.artifactType === input.artifactType &&
        link.artifactId === input.artifactId &&
        link.relation === input.relation,
    );
    if (duplicate) throw new Error('This artifact and relation are already linked to the case');
    this.repository.appendLink(AdjudicationCaseLink.add(input));
    return this.project([value])[0]!;
  }

  unlinkArtifact(input: UnlinkAdjudicationArtifactPayload): AdjudicationCaseDto {
    const value = this.requireCase(input.caseId);
    this.assertLinksEditable(value.id);
    const history = this.repository.findLinks([value.id]).get(value.id) ?? [];
    const source = activeAdjudicationLinks(history).find((link) => link.id === input.linkId);
    if (!source) throw new Error(`Active adjudication link ${input.linkId} was not found`);
    this.repository.appendLink(
      AdjudicationCaseLink.remove({
        caseId: value.id,
        source,
        statement: input.statement,
        officialName: input.officialName,
      }),
    );
    return this.project([value])[0]!;
  }

  private requireCase(id: string): AdjudicationCase {
    const value = this.repository.findCaseById(id);
    if (!value) throw new Error(`Adjudication case ${id} not found`);
    return value;
  }

  private assertLinksEditable(caseId: string): void {
    const entries = this.repository.findEntries([caseId]).get(caseId) ?? [];
    const status = adjudicationCaseStatus(entries);
    if (status === 'CLOSED' || status === 'VOID') {
      throw new Error(`A ${status.toLowerCase()} adjudication case cannot change artifact links`);
    }
  }

  private project(cases: readonly AdjudicationCase[]): AdjudicationCaseDto[] {
    const ids = cases.map((value) => value.id);
    const entriesByCase = this.repository.findEntries(ids);
    const linksByCase = this.repository.findLinks(ids);
    return cases.map((value) => {
      const entries = entriesByCase.get(value.id) ?? [];
      const linkHistory = linksByCase.get(value.id) ?? [];
      return {
        id: value.id,
        scopeType: value.scopeType,
        scopeId: value.scopeId,
        category: value.category,
        subject: value.subject,
        summary: value.summary,
        openedBy: value.openedBy,
        openedAt: value.openedAt.toISOString(),
        createdAt: value.createdAt.toISOString(),
        status: adjudicationCaseStatus(entries),
        entries: entries.map(toEntryDto),
        links: activeAdjudicationLinks(linkHistory).map(toLinkDto),
        linkHistory: linkHistory.map(toLinkDto),
      };
    });
  }
}

function assertEntryTransition(status: AdjudicationCaseStatus, next: AppendAdjudicationCaseEntryPayload['type']): void {
  if (status === 'VOID') throw new Error('A void adjudication case cannot be changed');
  if (next === 'REFERRED' && status !== 'OPEN') throw new Error('Only an open case can be referred');
  if (next === 'RESOLVED' && status !== 'OPEN' && status !== 'REFERRED') {
    throw new Error('Only an open or referred case can be resolved');
  }
  if (next === 'REOPENED' && status !== 'RESOLVED' && status !== 'CLOSED') {
    throw new Error('Only a resolved or closed case can be reopened');
  }
  if (next === 'CLOSED' && status !== 'RESOLVED') throw new Error('Resolve the case before closing it');
  if (next === 'VOID' && status === 'CLOSED') throw new Error('A closed case must be reopened before it can be voided');
}

function toEntryDto(value: AdjudicationCaseEntry): AdjudicationCaseDto['entries'][number] {
  return {
    id: value.id,
    caseId: value.caseId,
    type: value.type,
    statement: value.statement,
    officialName: value.officialName,
    ruleReference: value.ruleReference,
    occurredAt: value.occurredAt.toISOString(),
    recordedAt: value.recordedAt.toISOString(),
  };
}

function toLinkDto(value: AdjudicationCaseLink): AdjudicationCaseDto['linkHistory'][number] {
  return {
    id: value.id,
    caseId: value.caseId,
    operation: value.operation,
    artifactType: value.artifactType,
    artifactId: value.artifactId,
    relation: value.relation,
    labelSnapshot: value.labelSnapshot,
    statement: value.statement,
    officialName: value.officialName,
    recordedAt: value.recordedAt.toISOString(),
    reversesLinkId: value.reversesLinkId,
  };
}
