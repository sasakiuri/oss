import { describe, expect, it } from 'vitest';

import {
  PostCompetitionEquipmentControlService,
  type EquipmentControlEntry,
  type EquipmentControlSubject,
  type IEquipmentControlSubjectSource,
  type IPostCompetitionEquipmentCheckRepository,
  type PostCompetitionEquipmentCheck,
} from '@/main/modules/post-competition-equipment-control';

const CHAMPIONSHIP_ID = '11111111-1111-4111-8111-111111111111';
const EVENT_ID = '22222222-2222-4222-8222-222222222222';
const PARTICIPANT_ID = '33333333-3333-4333-8333-333333333333';
const SELECTED_AT = '2026-09-07T01:00:00.000Z';

class InMemoryRepository implements IPostCompetitionEquipmentCheckRepository {
  readonly checks: PostCompetitionEquipmentCheck[] = [];
  readonly entries: EquipmentControlEntry[] = [];

  appendChecks(checks: readonly PostCompetitionEquipmentCheck[]): void {
    this.checks.push(...checks);
  }

  appendEntry(entry: EquipmentControlEntry): void {
    this.entries.push(entry);
  }

  findById(checkId: string): PostCompetitionEquipmentCheck | null {
    return this.checks.find((check) => check.id === checkId) ?? null;
  }

  findByChampionship(championshipId: string): PostCompetitionEquipmentCheck[] {
    return this.checks.filter((check) => check.championshipId === championshipId);
  }

  findEntries(checkId: string): EquipmentControlEntry[] {
    return this.entries.filter((entry) => entry.checkId === checkId);
  }
}

class SubjectSource implements IEquipmentControlSubjectSource {
  find(eventId: string, participantId: string): EquipmentControlSubject | null {
    if (eventId !== EVENT_ID || participantId !== PARTICIPANT_ID) return null;
    return {
      championshipId: CHAMPIONSHIP_ID,
      eventId: EVENT_ID,
      eventName: '25m Pistol Women',
      eventType: 'P25',
      round: 'Qualification',
      participantId: PARTICIPANT_ID,
      athleteName: 'Athlete One',
      startNumber: '101',
      gender: 'F',
    };
  }
}

function createService() {
  const repository = new InMemoryRepository();
  const service = new PostCompetitionEquipmentControlService(
    repository,
    new SubjectSource(),
    () => new Date('2026-09-07T01:00:30.000Z'),
  );
  return { repository, service };
}

function select(
  service: PostCompetitionEquipmentControlService,
  basis:
    | 'RANDOM_DRAW'
    | 'TARGETED_CREDIBLE_EVIDENCE'
    | 'QUALIFICATION_FINALIST_TOP_10'
    | 'PISTOL_TRIGGER_RANDOM_DRAW' = 'RANDOM_DRAW',
) {
  return service.select({
    championshipId: CHAMPIONSHIP_ID,
    eventId: EVENT_ID,
    participantIds: [PARTICIPANT_ID],
    selectionBasis: basis,
    selectionStatement: 'Drawn by the Equipment Control Jury after Qualification.',
    selectedBy: 'EC Jury A',
    selectedAt: SELECTED_AT,
  })[0]!;
}

describe('PostCompetitionEquipmentControlService', () => {
  it('captures the official subject snapshot and keeps a confirmed failure separate from DSQ', () => {
    const { service } = createService();
    const selected = select(service, 'PISTOL_TRIGGER_RANDOM_DRAW');

    expect(selected).toMatchObject({
      athleteName: 'Athlete One',
      startNumber: '101',
      gender: 'F',
      status: 'SELECTED',
      ruleReferences: ['ISSF 6.7.9.1', 'ISSF 8.4.2.3'],
      separateDisqualificationActionRequired: false,
    });

    const failed = service.recordTest({
      checkId: selected.id,
      outcome: 'FAILED',
      testedItems: ['Trigger weight'],
      clothingOrTapingCheck: false,
      sameGenderJudgeAvailable: null,
      attempts: 3,
      performedBy: 'Equipment Control Officer',
      equipmentControlJurySupervisor: 'EC Jury A',
      statement: 'The pistol failed to lift the test weight in all three attempts.',
      testedAt: '2026-09-07T01:05:00.000Z',
    });
    expect(failed.status).toBe('FAILED_PENDING_CONFIRMATION');
    expect(failed.separateDisqualificationActionRequired).toBe(false);

    const confirmed = service.confirmFailure({
      checkId: selected.id,
      calibrationReference: 'CAL-2026-09-07-A; ISSF calibration test passed',
      confirmedBy: 'EC Jury Chair',
      confirmerRole: 'EQUIPMENT_CONTROL_JURY_CHAIR',
      statement: 'Confirmed that the test was performed correctly.',
      confirmedAt: '2026-09-07T01:08:00.000Z',
    });
    expect(confirmed.status).toBe('FAILED_CONFIRMED');
    expect(confirmed.separateDisqualificationActionRequired).toBe(true);
    expect(confirmed.sanctionAuthorityReference).toBe(`EQUIPMENT-CONTROL:${selected.id}`);
    expect(confirmed.entries.at(-1)).toMatchObject({
      type: 'FAILURE_CONFIRMED',
      testPerformedCorrectly: true,
    });
    expect(() =>
      service.voidCheck({
        checkId: selected.id,
        reason: 'Attempted correction after confirmation.',
        officialName: 'EC Jury A',
        voidedAt: '2026-09-07T01:09:00.000Z',
      }),
    ).toThrow('separate appeal workflow');
  });

  it('requires written notice before recording failure to report', () => {
    const { service } = createService();
    const selected = select(service);
    const nonReport = {
      checkId: selected.id,
      outcome: 'DID_NOT_REPORT' as const,
      testedItems: [],
      clothingOrTapingCheck: false,
      sameGenderJudgeAvailable: null,
      attempts: null,
      performedBy: 'Equipment Control Officer',
      equipmentControlJurySupervisor: 'EC Jury A',
      statement: 'Athlete did not report.',
      testedAt: '2026-09-07T01:10:00.000Z',
    };

    expect(() => service.recordTest(nonReport)).toThrow('recorded written notice');
    service.issueNotice({
      checkId: selected.id,
      deliveryMethod: 'Printed notice handed to athlete',
      noticeReference: 'NOTICE-001',
      officialName: 'Equipment Control Officer',
      statement: 'Report immediately after the last series.',
      issuedAt: '2026-09-07T01:01:00.000Z',
    });

    expect(service.recordTest(nonReport).status).toBe('DID_NOT_REPORT_PENDING_CONFIRMATION');
  });

  it('rejects clothing or taping results without a same-gender judge available', () => {
    const { service } = createService();
    const selected = select(service);

    expect(() =>
      service.recordTest({
        checkId: selected.id,
        outcome: 'PASSED',
        testedItems: ['Taping'],
        clothingOrTapingCheck: true,
        sameGenderJudgeAvailable: false,
        attempts: null,
        performedBy: 'Equipment Control Officer',
        equipmentControlJurySupervisor: 'EC Jury A',
        statement: 'Taping inspected.',
        testedAt: '2026-09-07T01:05:00.000Z',
      }),
    ).toThrow('same-gender judge');
  });

  it('permits correction by voiding an unconfirmed check', () => {
    const { service } = createService();
    const selected = select(service, 'TARGETED_CREDIBLE_EVIDENCE');
    const voided = service.voidCheck({
      checkId: selected.id,
      reason: 'The wrong participant was selected.',
      officialName: 'EC Jury A',
      voidedAt: '2026-09-07T01:02:00.000Z',
    });
    expect(voided.status).toBe('VOIDED');

    const replacement = select(service, 'TARGETED_CREDIBLE_EVIDENCE');
    expect(replacement.id).not.toBe(selected.id);
  });

  it('rejects duplicate active selections with the same basis', () => {
    const { service } = createService();
    select(service);
    expect(() => select(service)).toThrow('active RANDOM_DRAW check');
  });
});
