import type {
  ConfirmEquipmentControlFailurePayload,
  IssueEquipmentControlNoticePayload,
  PostCompetitionEquipmentCheckDto,
  RecordEquipmentControlTestPayload,
  SelectEquipmentControlAthletesPayload,
  VoidEquipmentControlCheckPayload,
} from '@/shared/ipc/contracts';

import type { IPostCompetitionEquipmentCheckRepository } from '../domain/IPostCompetitionEquipmentCheckRepository';
import {
  createEquipmentControlEntry,
  equipmentControlCheckStatus,
  PostCompetitionEquipmentCheck,
  type EquipmentControlEntry,
} from '../domain/PostCompetitionEquipmentCheck';
import type { IEquipmentControlSubjectSource } from './EquipmentControlSubjectSource';

export class PostCompetitionEquipmentControlService {
  constructor(
    private readonly repository: IPostCompetitionEquipmentCheckRepository,
    private readonly subjects: IEquipmentControlSubjectSource,
    private readonly now: () => Date = () => new Date(),
  ) {}

  list(championshipId: string): PostCompetitionEquipmentCheckDto[] {
    return this.repository.findByChampionship(championshipId).map((check) => this.project(check));
  }

  select(input: SelectEquipmentControlAthletesPayload): PostCompetitionEquipmentCheckDto[] {
    const participantIds = [...new Set(input.participantIds)];
    const existingActive = this.repository
      .findByChampionship(input.championshipId)
      .filter((check) => equipmentControlCheckStatus(this.repository.findEntries(check.id)) !== 'VOIDED');
    const checks = participantIds.map((participantId) => {
      const subject = this.subjects.find(input.eventId, participantId);
      if (!subject || subject.championshipId !== input.championshipId) {
        throw new Error(`Participant ${participantId} does not belong to the selected event and Championship`);
      }
      if (
        existingActive.some(
          (check) =>
            check.eventId === input.eventId &&
            check.participantId === participantId &&
            check.selectionBasis === input.selectionBasis,
        )
      ) {
        throw new Error(`An active ${input.selectionBasis} check already exists for ${subject.athleteName}`);
      }
      return PostCompetitionEquipmentCheck.create({
        ...subject,
        selectionBasis: input.selectionBasis,
        selectionStatement: input.selectionStatement,
        selectedBy: input.selectedBy,
        selectedAt: new Date(input.selectedAt),
        recordedAt: this.now(),
      });
    });
    this.repository.appendChecks(checks);
    return checks.map((check) => this.project(check));
  }

  issueNotice(input: IssueEquipmentControlNoticePayload): PostCompetitionEquipmentCheckDto {
    const { check, entries } = this.requireOpenCheck(input.checkId);
    if (entries.some((entry) => entry.type === 'NOTICE_ISSUED')) throw new Error('Written notice is already recorded');
    if (entries.some((entry) => entry.type === 'TEST_RECORDED')) throw new Error('A test result is already recorded');
    this.repository.appendEntry(
      createEquipmentControlEntry({
        type: 'NOTICE_ISSUED',
        checkId: check.id,
        deliveryMethod: input.deliveryMethod,
        noticeReference: input.noticeReference,
        officialName: input.officialName,
        statement: input.statement,
        occurredAt: new Date(input.issuedAt),
        recordedAt: this.now(),
      }),
    );
    return this.project(check);
  }

  recordTest(input: RecordEquipmentControlTestPayload): PostCompetitionEquipmentCheckDto {
    const { check, entries } = this.requireOpenCheck(input.checkId);
    if (entries.some((entry) => entry.type === 'TEST_RECORDED')) throw new Error('A test result is already recorded');
    if (input.outcome === 'DID_NOT_REPORT' && !entries.some((entry) => entry.type === 'NOTICE_ISSUED')) {
      throw new Error('Failure to report requires a recorded written notice');
    }
    this.repository.appendEntry(
      createEquipmentControlEntry({
        type: 'TEST_RECORDED',
        checkId: check.id,
        outcome: input.outcome,
        testedItems: input.testedItems,
        clothingOrTapingCheck: input.clothingOrTapingCheck,
        sameGenderJudgeAvailable: input.sameGenderJudgeAvailable,
        attempts: input.attempts,
        performedBy: input.performedBy,
        equipmentControlJurySupervisor: input.equipmentControlJurySupervisor,
        statement: input.statement,
        occurredAt: new Date(input.testedAt),
        recordedAt: this.now(),
      }),
    );
    return this.project(check);
  }

  confirmFailure(input: ConfirmEquipmentControlFailurePayload): PostCompetitionEquipmentCheckDto {
    const { check, entries } = this.requireOpenCheck(input.checkId);
    const result = entries.find((entry) => entry.type === 'TEST_RECORDED');
    if (!result || result.outcome === 'PASSED') throw new Error('Only a failed or non-report result can be confirmed');
    if (entries.some((entry) => entry.type === 'FAILURE_CONFIRMED')) throw new Error('Failure is already confirmed');
    this.repository.appendEntry(
      createEquipmentControlEntry({
        type: 'FAILURE_CONFIRMED',
        checkId: check.id,
        confirmsEntryId: result.id,
        calibrationReference: input.calibrationReference,
        confirmedBy: input.confirmedBy,
        confirmerRole: input.confirmerRole,
        testPerformedCorrectly: true,
        statement: input.statement,
        occurredAt: new Date(input.confirmedAt),
        recordedAt: this.now(),
      }),
    );
    return this.project(check);
  }

  voidCheck(input: VoidEquipmentControlCheckPayload): PostCompetitionEquipmentCheckDto {
    const { check, entries } = this.requireOpenCheck(input.checkId);
    if (entries.some((entry) => entry.type === 'FAILURE_CONFIRMED')) {
      throw new Error('A confirmed failure cannot be voided; record any appeal in the separate appeal workflow');
    }
    this.repository.appendEntry(
      createEquipmentControlEntry({
        type: 'CHECK_VOIDED',
        checkId: check.id,
        officialName: input.officialName,
        statement: input.reason,
        occurredAt: new Date(input.voidedAt),
        recordedAt: this.now(),
      }),
    );
    return this.project(check);
  }

  private requireOpenCheck(checkId: string): {
    check: PostCompetitionEquipmentCheck;
    entries: EquipmentControlEntry[];
  } {
    const check = this.repository.findById(checkId);
    if (!check) throw new Error(`Post-competition equipment check ${checkId} not found`);
    const entries = this.repository.findEntries(check.id);
    if (equipmentControlCheckStatus(entries) === 'VOIDED') throw new Error('The equipment check is voided');
    return { check, entries };
  }

  private project(check: PostCompetitionEquipmentCheck): PostCompetitionEquipmentCheckDto {
    const entries = this.repository.findEntries(check.id);
    const status = equipmentControlCheckStatus(entries);
    return {
      id: check.id,
      championshipId: check.championshipId,
      eventId: check.eventId,
      eventName: check.eventName,
      eventType: check.eventType,
      round: check.round,
      participantId: check.participantId,
      athleteName: check.athleteName,
      startNumber: check.startNumber,
      gender: check.gender,
      selectionBasis: check.selectionBasis,
      selectionStatement: check.selectionStatement,
      selectedBy: check.selectedBy,
      selectedAt: check.selectedAt.toISOString(),
      recordedAt: check.recordedAt.toISOString(),
      ruleReferences: [...check.ruleReferences],
      status,
      separateDisqualificationActionRequired: status === 'FAILED_CONFIRMED' || status === 'DID_NOT_REPORT_CONFIRMED',
      sanctionAuthorityReference: `EQUIPMENT-CONTROL:${check.id}`,
      entries: entries.map(toEntryDto),
    };
  }
}

function toEntryDto(entry: EquipmentControlEntry): PostCompetitionEquipmentCheckDto['entries'][number] {
  const base = {
    id: entry.id,
    checkId: entry.checkId,
    statement: entry.statement,
    occurredAt: entry.occurredAt.toISOString(),
    recordedAt: entry.recordedAt.toISOString(),
  };
  switch (entry.type) {
    case 'NOTICE_ISSUED':
      return { ...base, ...entry, occurredAt: base.occurredAt, recordedAt: base.recordedAt };
    case 'TEST_RECORDED':
      return {
        ...base,
        ...entry,
        testedItems: [...entry.testedItems],
        occurredAt: base.occurredAt,
        recordedAt: base.recordedAt,
      };
    case 'FAILURE_CONFIRMED':
      return { ...base, ...entry, occurredAt: base.occurredAt, recordedAt: base.recordedAt };
    case 'CHECK_VOIDED':
      return { ...base, ...entry, occurredAt: base.occurredAt, recordedAt: base.recordedAt };
  }
}
