import { describe, expect, it } from 'vitest';
import { ISSF_2026_RFPM, assessQualificationMalfunctionClaim } from '@sasakiuri/saika-rules';

import {
  QualificationMalfunctionCase,
  QualificationMalfunctionEntry,
  QualificationMalfunctionPublicationBlocker,
  type IQualificationMalfunctionRepository,
} from '@/main/modules/qualification-malfunctions';

const eventId = '11111111-1111-4111-8111-111111111111';

describe('QualificationMalfunctionPublicationBlocker', () => {
  it('blocks only Qualification results until every non-void case has a complete audit trail', () => {
    const repository = new MemoryRepository();
    const blocker = new QualificationMalfunctionPublicationBlocker(repository);
    const open = createCase('22222222-2222-4222-8222-222222222222');
    repository.appendCase(open);

    expect(blocker.getIssues(eventId, 'QUALIFICATION')).toEqual([
      `Qualification malfunction case ${open.id} is unresolved`,
    ]);
    expect(blocker.getIssues(eventId, 'FINAL')).toEqual([]);

    repository.appendEntry(entry(open.id, 'VOID'));
    expect(blocker.getIssues(eventId, 'QUALIFICATION')).toEqual([]);

    const malformed = createCase('33333333-3333-4333-8333-333333333333');
    repository.appendCase(malformed);
    repository.appendEntry(entry(malformed.id, 'COMPLETED'));
    expect(blocker.getIssues(eventId, 'QUALIFICATION')).toEqual([
      `Qualification malfunction case ${malformed.id} has an incomplete audit trail`,
    ]);

    const complete = createCase('44444444-4444-4444-8444-444444444444');
    repository.appendCase(complete);
    repository.appendEntry(
      QualificationMalfunctionEntry.create({
        caseId: complete.id,
        type: 'CLASSIFIED',
        classification: 'ALLOWABLE',
        causeCode: 'PROJECTILE_LODGED',
        statement: 'Allowable malfunction.',
        officialName: 'RO A',
        officialRole: 'RANGE_OFFICER',
      }),
    );
    repository.appendEntry(
      QualificationMalfunctionEntry.create({
        caseId: complete.id,
        type: 'REMEDY_AUTHORIZED',
        remedy: 'REPEAT_FULL_SERIES',
        shotsToFire: 5,
        statement: 'Repeat authorized.',
        officialName: 'RO A',
        officialRole: 'RANGE_OFFICER',
      }),
    );
    repository.appendEntry(entry(complete.id, 'EXECUTION_RECORDED', 'execution:1'));
    repository.appendEntry(entry(complete.id, 'SCORE_SETTLED', 'settlement:1'));
    repository.appendEntry(entry(complete.id, 'COMPLETED'));
    repository.appendEntry(entry(malformed.id, 'VOID'));

    expect(blocker.getIssues(eventId, 'QUALIFICATION')).toEqual([]);
  });
});

function createCase(id: string): QualificationMalfunctionCase {
  const capability = ISSF_2026_RFPM.capabilities.qualificationMalfunction!;
  return QualificationMalfunctionCase.create({
    id,
    competitionId: '55555555-5555-4555-8555-555555555555',
    eventId,
    competitionTypeId: 'RFPM',
    policySnapshot: capability,
    participantId: '66666666-6666-4666-8666-666666666666',
    participantNameSnapshot: 'Athlete A',
    laneId: '77777777-7777-4777-8777-777777777777',
    laneChannelSnapshot: 7,
    relayNumberSnapshot: 1,
    reportSource: 'DIRECTOR_MANUAL',
    claimMode: 'CLAIM',
    phase: 'MATCH',
    stageId: 'STAGE_1',
    stageIndex: 1,
    seriesIndex: 0,
    seriesShotLimit: 5,
    recordedShots: 2,
    timedTargetProgramId: 'RFP_MATCH_8',
    existingClaimsInScope: 0,
    claimAssessment: assessQualificationMalfunctionClaim(capability, {
      phase: 'MATCH',
      existingClaimsInScope: 0,
    }),
    summary: 'Malfunction.',
    openedBy: 'RO A',
  });
}

function entry(
  caseId: string,
  type: 'VOID' | 'EXECUTION_RECORDED' | 'SCORE_SETTLED' | 'COMPLETED',
  artifactId?: string,
): QualificationMalfunctionEntry {
  return QualificationMalfunctionEntry.create({
    caseId,
    type,
    statement: type,
    officialName: type === 'SCORE_SETTLED' ? 'RTS A' : 'Jury A',
    officialRole: type === 'SCORE_SETTLED' ? 'RTS_OFFICER' : 'JURY_MEMBER',
    ...(artifactId ? { artifactId } : {}),
  });
}

class MemoryRepository implements IQualificationMalfunctionRepository {
  private readonly cases: QualificationMalfunctionCase[] = [];
  private readonly entries: QualificationMalfunctionEntry[] = [];

  appendCase(value: QualificationMalfunctionCase): void {
    this.cases.push(value);
  }

  appendEntry(value: QualificationMalfunctionEntry): void {
    this.entries.push(value);
  }

  findCaseById(id: string): QualificationMalfunctionCase | null {
    return this.cases.find((value) => value.id === id) ?? null;
  }

  findCasesByCompetition(id: string): QualificationMalfunctionCase[] {
    return this.cases.filter((value) => value.competitionId === id);
  }

  findCasesByEvent(id: string): QualificationMalfunctionCase[] {
    return this.cases.filter((value) => value.eventId === id);
  }

  findCasesByEventAndParticipant(targetEventId: string, participantId: string): QualificationMalfunctionCase[] {
    return this.cases.filter((value) => value.eventId === targetEventId && value.participantId === participantId);
  }

  findEntries(caseIds: readonly string[]): Map<string, QualificationMalfunctionEntry[]> {
    return new Map(caseIds.map((id) => [id, this.entries.filter((value) => value.caseId === id)]));
  }

  executeInTransaction<T>(work: () => T): T {
    return work();
  }
}
