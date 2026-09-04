import { describe, expect, it } from 'vitest';
import { ISSF_2026_RFPM, ISSF_2026_STDP, type QualificationMalfunctionCapability } from '@sasakiuri/saika-rules';

import { QualificationMalfunctionService } from '@/main/modules/qualification-malfunctions';
import type {
  IQualificationMalfunctionPolicyResolver,
  IQualificationMalfunctionRepository,
  IQualificationMalfunctionSignalSource,
  IQualificationMalfunctionSubjectResolver,
  QualificationMalfunctionCase,
  QualificationMalfunctionEntry,
} from '@/main/modules/qualification-malfunctions';
import {
  qualificationMalfunctionsContract,
  type CreateQualificationMalfunctionCasePayload,
} from '@/shared/ipc/contracts';

const competitionId = '11111111-1111-4111-8111-111111111111';
const eventId = '22222222-2222-4222-8222-222222222222';
const participantId = '33333333-3333-4333-8333-333333333333';
const laneId = '44444444-4444-4444-8444-444444444444';
const sourceSignalId = '55555555-5555-4555-8555-555555555555';
const laneSessionId = '66666666-6666-4666-8666-666666666666';

describe('QualificationMalfunctionService', () => {
  it('counts claims by athlete and 30-shot stage, and a void correction releases the allowance', () => {
    const repository = new InMemoryQualificationMalfunctionRepository();
    const service = createService(repository, rfpmPolicy());

    const first = service.create(input({ stageIndex: 1 }));
    expect(first.existingClaimsInScope).toBe(0);
    expect(() => service.create(input({ stageIndex: 1 }))).toThrow('SCOPE_LIMIT_REACHED');

    const otherStage = service.create(input({ stageIndex: 2 }));
    expect(otherStage.existingClaimsInScope).toBe(0);

    service.appendEntry({
      caseId: first.id,
      type: 'VOID',
      statement: 'Duplicate report voided.',
      officialName: 'Jury A',
      officialRole: 'JURY_MEMBER',
    });
    const replacement = service.create(input({ stageIndex: 1 }));
    expect(replacement.existingClaimsInScope).toBe(0);
  });

  it('enforces the two-part Standard Pistol limit independently from the whole-match limit', () => {
    const repository = new InMemoryQualificationMalfunctionRepository();
    const service = createService(repository, stdpPolicy());

    service.create(input({ stageIndex: 1, exceptionalMatchPart: 1 }));
    expect(() => service.create(input({ stageIndex: 2, exceptionalMatchPart: 1 }))).toThrow('PART_LIMIT_REACHED');
    const partTwo = service.create(input({ stageIndex: 2, exceptionalMatchPart: 2 }));
    expect(partTwo.existingClaimsInScope).toBe(1);
    expect(partTwo.existingClaimsInPart).toBe(0);
    expect(() => service.create(input({ stageIndex: 3, exceptionalMatchPart: 2 }))).toThrow('SCOPE_LIMIT_REACHED');
  });

  it('allows sighting documentation without consuming a prohibited 25m claim', () => {
    const repository = new InMemoryQualificationMalfunctionRepository();
    const service = createService(repository, rfpmPolicy('SIGHTING'));

    expect(() => service.create(input({ stageIndex: 0 }))).toThrow('SIGHTING_CLAIM_PROHIBITED');
    const documented = service.create(
      input({
        stageIndex: 0,
        claimMode: 'DOCUMENTATION_ONLY',
        reportSource: 'DIRECTOR_MANUAL',
        sourceSignalId: undefined,
      }),
    );

    expect(documented.claimAssessment).toMatchObject({ allowed: false, reason: 'SIGHTING_CLAIM_PROHIBITED' });
    expect(documented.status).toBe('OPEN');
  });

  it('requires a source signal only for Lane-originated cases and projects the immutable link', () => {
    const repository = new InMemoryQualificationMalfunctionRepository();
    const service = createService(repository, rfpmPolicy());
    const createSchema = qualificationMalfunctionsContract.procedures.create.input;

    expect(createSchema.safeParse(laneInput({ sourceSignalId: undefined })).success).toBe(false);
    expect(createSchema.safeParse(input({ sourceSignalId })).success).toBe(false);

    expect(service.create(laneInput())).toMatchObject({
      reportSource: 'LANE_SIGNAL',
      sourceSignalId,
      laneSessionId,
      occurredAt: '2026-09-04T01:00:00.000Z',
    });
    expect(() => service.create(laneInput({ recordedShots: 1 }))).toThrow('declaration context does not match');
  });

  it('keeps inspection, human classification, remedy, execution, and settlement as separate decisions', () => {
    const repository = new InMemoryQualificationMalfunctionRepository();
    const service = createService(repository, rfpmPolicy());
    let value = service.create(input({ stageIndex: 1, recordedShots: 2 }));

    expect(() =>
      service.appendEntry({
        caseId: value.id,
        type: 'CLASSIFIED',
        classification: 'ALLOWABLE',
        causeCode: 'PROJECTILE_LODGED',
        statement: 'Inspected firearm.',
        officialName: 'RO A',
        officialRole: 'RANGE_OFFICER',
      }),
    ).toThrow('recorded inspection');
    value = service.appendEntry({
      caseId: value.id,
      type: 'INSPECTION_RECORDED',
      statement: 'Firearm secured for inspection.',
      officialName: 'RO A',
      officialRole: 'RANGE_OFFICER',
    });
    expect(() =>
      service.appendEntry({
        caseId: value.id,
        type: 'CLASSIFIED',
        classification: 'ALLOWABLE',
        causeCode: 'PROJECTILE_LODGED',
        statement: 'Projectile was lodged.',
        officialName: 'Jury A',
        officialRole: 'JURY_MEMBER',
      }),
    ).toThrow('may not determine');
    value = service.appendEntry({
      caseId: value.id,
      type: 'CLASSIFIED',
      classification: 'ALLOWABLE',
      causeCode: 'PROJECTILE_LODGED',
      statement: 'Projectile was lodged.',
      officialName: 'RO A',
      officialRole: 'RANGE_OFFICER',
    });
    expect(value.entries.at(-1)?.ruleReference).toBe('8.9.4.1(a)');
    expect(() =>
      service.appendEntry({
        caseId: value.id,
        type: 'REMEDY_AUTHORIZED',
        remedy: 'COMPLETE_REMAINING_SHOTS',
        shotsToFire: 3,
        statement: 'Complete the original series.',
        officialName: 'RO A',
        officialRole: 'RANGE_OFFICER',
      }),
    ).toThrow('REPEAT_FULL_SERIES with 5');
    value = service.appendEntry({
      caseId: value.id,
      type: 'REMEDY_AUTHORIZED',
      remedy: 'REPEAT_FULL_SERIES',
      shotsToFire: 5,
      statement: 'Repeat the five-shot series.',
      officialName: 'RO A',
      officialRole: 'RANGE_OFFICER',
    });
    expect(() =>
      service.appendEntry({
        caseId: value.id,
        type: 'EXECUTION_RECORDED',
        statement: 'Repeat completed.',
        officialName: 'RO A',
        officialRole: 'RANGE_OFFICER',
      }),
    ).toThrow('artifact reference');
    value = service.appendEntry({
      caseId: value.id,
      type: 'EXECUTION_RECORDED',
      artifactId: 'lane-recovery:execution-1',
      statement: 'Repeat completed.',
      officialName: 'RO A',
      officialRole: 'RANGE_OFFICER',
    });
    value = service.appendEntry({
      caseId: value.id,
      type: 'SCORE_SETTLED',
      artifactId: 'score-settlement:settlement-1',
      statement: 'Five lowest scores settled.',
      officialName: 'RTS A',
      officialRole: 'RTS_OFFICER',
    });
    value = service.appendEntry({
      caseId: value.id,
      type: 'COMPLETED',
      statement: 'Case complete.',
      officialName: 'Jury A',
      officialRole: 'JURY_MEMBER',
    });

    expect(value.status).toBe('COMPLETED');
    expect(value.entries.map((entry) => entry.type)).toEqual([
      'INSPECTION_RECORDED',
      'CLASSIFIED',
      'REMEDY_AUTHORIZED',
      'EXECUTION_RECORDED',
      'SCORE_SETTLED',
      'COMPLETED',
    ]);
    expect(
      qualificationMalfunctionsContract.procedures.create.output.parse({ success: true, data: value }),
    ).toMatchObject({ success: true, data: { status: 'COMPLETED' } });
  });
});

function createService(
  repository: IQualificationMalfunctionRepository,
  policies: IQualificationMalfunctionPolicyResolver,
): QualificationMalfunctionService {
  const subjects: IQualificationMalfunctionSubjectResolver = {
    resolve: ({ reportSource }) => ({
      participantName: 'Athlete A',
      startNumber: '101',
      laneSnapshotCapturedAt: reportSource === 'LANE_SIGNAL' ? new Date('2026-09-04T01:00:00.000Z') : null,
    }),
  };
  const signals: IQualificationMalfunctionSignalSource = {
    findById: (id) =>
      id === sourceSignalId
        ? {
            signalId: sourceSignalId,
            laneId,
            status: 'ACTIVE',
            competitionId,
            sessionId: laneSessionId,
            participantId,
            participantName: 'Athlete A',
            startNumber: '101',
            phase: 'MATCH',
            stageIndex: 1,
            seriesIndex: 0,
            seriesShotLimit: 5,
            recordedShots: 0,
            timedTargetProgramId: 'RFPM_PROGRAM',
            exposureIndex: null,
            message: 'Firearm failed during the series.',
            signalledAt: new Date('2026-09-04T01:00:00.000Z'),
          }
        : null,
  };
  return new QualificationMalfunctionService(repository, policies, subjects, signals);
}

function rfpmPolicy(phase: 'SIGHTING' | 'MATCH' = 'MATCH'): IQualificationMalfunctionPolicyResolver {
  return policyResolver(ISSF_2026_RFPM.capabilities.qualificationMalfunction!, phase, (stageIndex) =>
    phase === 'SIGHTING' ? 'PREPARATION' : `STAGE_${stageIndex}`,
  );
}

function stdpPolicy(): IQualificationMalfunctionPolicyResolver {
  const ids = ['PREPARATION', 'STAGE_1_150_SECONDS', 'STAGE_2_20_SECONDS', 'STAGE_3_10_SECONDS'];
  return policyResolver(
    ISSF_2026_STDP.capabilities.qualificationMalfunction!,
    'MATCH',
    (stageIndex) => ids[stageIndex]!,
  );
}

function policyResolver(
  capability: QualificationMalfunctionCapability,
  phase: 'SIGHTING' | 'MATCH',
  stageId: (stageIndex: number) => string,
): IQualificationMalfunctionPolicyResolver {
  return {
    resolve: ({ stageIndex, seriesIndex }) => ({
      competitionTypeId: 'RFPM',
      rulePackIdentity: null,
      capability,
      phase,
      stageId: stageId(stageIndex),
      stageIndex,
      seriesIndex,
      seriesShotLimit: phase === 'SIGHTING' ? null : 5,
      timedTargetProgramId: 'RFPM_PROGRAM',
    }),
  };
}

function input(
  overrides: Partial<CreateQualificationMalfunctionCasePayload> = {},
): CreateQualificationMalfunctionCasePayload {
  return {
    competitionId,
    eventId,
    participantId,
    laneId,
    laneChannel: 7,
    relayNumber: 1,
    reportSource: 'DIRECTOR_MANUAL',
    claimMode: 'CLAIM',
    stageIndex: 1,
    seriesIndex: 0,
    recordedShots: 0,
    summary: 'Firearm failed during the series.',
    openedBy: 'RO A',
    ...overrides,
  };
}

function laneInput(
  overrides: Partial<CreateQualificationMalfunctionCasePayload> = {},
): CreateQualificationMalfunctionCasePayload {
  return input({
    reportSource: 'LANE_SIGNAL',
    sourceSignalId,
    laneSessionId,
    ...overrides,
  });
}

class InMemoryQualificationMalfunctionRepository implements IQualificationMalfunctionRepository {
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

  findCasesByEventAndParticipant(targetEventId: string, targetParticipantId: string): QualificationMalfunctionCase[] {
    return this.cases.filter((value) => value.eventId === targetEventId && value.participantId === targetParticipantId);
  }

  findEntries(caseIds: readonly string[]): Map<string, QualificationMalfunctionEntry[]> {
    return new Map(caseIds.map((id) => [id, this.entries.filter((entry) => entry.caseId === id)]));
  }

  executeInTransaction<T>(work: () => T): T {
    return work();
  }
}
