import { describe, expect, it } from 'vitest';

import {
  AdjudicationCaseService,
  type AdjudicationCase,
  type AdjudicationCaseEntry,
  type AdjudicationCaseLink,
  type AdjudicationCaseScopeType,
  type IAdjudicationCaseRepository,
} from '@/main/modules/adjudication-cases';

const eventId = '11111111-1111-4111-8111-111111111111';
const artifactId = '22222222-2222-4222-8222-222222222222';

class MemoryRepository implements IAdjudicationCaseRepository {
  readonly cases: AdjudicationCase[] = [];
  readonly entries: AdjudicationCaseEntry[] = [];
  readonly links: AdjudicationCaseLink[] = [];

  appendCase(value: AdjudicationCase): void {
    this.cases.push(value);
  }
  appendEntry(value: AdjudicationCaseEntry): void {
    this.entries.push(value);
  }
  appendLink(value: AdjudicationCaseLink): void {
    this.links.push(value);
  }
  findCaseById(id: string): AdjudicationCase | null {
    return this.cases.find((value) => value.id === id) ?? null;
  }
  findCasesByScope(scopeType: AdjudicationCaseScopeType, scopeId: string): AdjudicationCase[] {
    return this.cases.filter((value) => value.scopeType === scopeType && value.scopeId === scopeId);
  }
  findEntries(caseIds: readonly string[]): Map<string, AdjudicationCaseEntry[]> {
    return new Map(caseIds.map((id) => [id, this.entries.filter((value) => value.caseId === id)]));
  }
  findLinks(caseIds: readonly string[]): Map<string, AdjudicationCaseLink[]> {
    return new Map(caseIds.map((id) => [id, this.links.filter((value) => value.caseId === id)]));
  }
}

describe('AdjudicationCaseService', () => {
  it('links and unlinks independent official artifacts without mutating them', () => {
    const repository = new MemoryRepository();
    const service = new AdjudicationCaseService(repository);
    let value = service.create({
      scopeType: 'EVENT',
      scopeId: eventId,
      category: 'RANGE_INCIDENT',
      subject: 'Disputed shot and penalty',
      summary: 'Keep the incident, decision, and any protest in one review file.',
      openedBy: 'RTS Jury A',
    });

    value = service.linkArtifact({
      caseId: value.id,
      artifactType: 'RANGE_INCIDENT_REPORT',
      artifactId,
      relation: 'REPORT',
      labelSnapshot: 'IR 14',
      statement: 'Primary range report.',
      officialName: 'RTS Jury A',
    });
    expect(value.links).toHaveLength(1);
    const linkId = value.links[0]!.id;

    value = service.unlinkArtifact({
      caseId: value.id,
      linkId,
      statement: 'Linked to the wrong incident.',
      officialName: 'RTS Jury A',
    });
    expect(value.links).toHaveLength(0);
    expect(value.linkHistory.map((link) => link.operation)).toEqual(['ADD', 'REMOVE']);
    expect(repository.links[0]?.artifactId).toBe(artifactId);
  });

  it('enforces an explicit resolution and reopening lifecycle while retaining notes', () => {
    const service = new AdjudicationCaseService(new MemoryRepository());
    let value = service.create({
      scopeType: 'EVENT',
      scopeId: eventId,
      category: 'SCORING',
      subject: 'Score review',
      summary: 'Review a disputed score.',
      openedBy: 'Jury A',
    });
    expect(() =>
      service.appendEntry({
        caseId: value.id,
        type: 'CLOSED',
        statement: 'Premature close.',
        officialName: 'Jury A',
      }),
    ).toThrow('Resolve the case');

    value = service.appendEntry({
      caseId: value.id,
      type: 'RESOLVED',
      statement: 'Score confirmed.',
      officialName: 'Jury A',
      ruleReference: 'ISSF 6.10.8',
    });
    value = service.appendEntry({
      caseId: value.id,
      type: 'CLOSED',
      statement: 'All follow-up complete.',
      officialName: 'Jury A',
    });
    expect(value.status).toBe('CLOSED');

    value = service.appendEntry({
      caseId: value.id,
      type: 'REOPENED',
      statement: 'A written protest was received.',
      officialName: 'Jury B',
    });
    expect(value.status).toBe('OPEN');
    expect(value.entries).toHaveLength(3);
  });
});
