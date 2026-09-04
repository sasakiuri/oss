export const EQUIPMENT_CONTROL_SELECTION_BASES = [
  'RANDOM_DRAW',
  'TARGETED_CREDIBLE_EVIDENCE',
  'QUALIFICATION_FINALIST_TOP_10',
  'PISTOL_TRIGGER_RANDOM_DRAW',
] as const;
export type EquipmentControlSelectionBasis = (typeof EQUIPMENT_CONTROL_SELECTION_BASES)[number];

export const EQUIPMENT_CONTROL_OUTCOMES = ['PASSED', 'FAILED', 'DID_NOT_REPORT'] as const;
export type EquipmentControlOutcome = (typeof EQUIPMENT_CONTROL_OUTCOMES)[number];

export type EquipmentControlConfirmationRole =
  'EQUIPMENT_CONTROL_JURY_CHAIR' | 'EQUIPMENT_CONTROL_JURY_MEMBER' | 'COMPETITION_JURY_MEMBER';

export class PostCompetitionEquipmentCheck {
  private constructor(
    readonly id: string,
    readonly championshipId: string,
    readonly eventId: string,
    readonly eventName: string,
    readonly eventType: string,
    readonly round: string,
    readonly participantId: string,
    readonly athleteName: string,
    readonly startNumber: string | null,
    readonly gender: string,
    readonly selectionBasis: EquipmentControlSelectionBasis,
    readonly selectionStatement: string,
    readonly selectedBy: string,
    readonly selectedAt: Date,
    readonly recordedAt: Date,
    readonly ruleReferences: readonly string[],
  ) {
    Object.freeze(this.ruleReferences);
    Object.freeze(this);
  }

  static create(props: {
    id?: string;
    championshipId: string;
    eventId: string;
    eventName: string;
    eventType: string;
    round: string;
    participantId: string;
    athleteName: string;
    startNumber?: string | null;
    gender: string;
    selectionBasis: EquipmentControlSelectionBasis;
    selectionStatement: string;
    selectedBy: string;
    selectedAt: Date;
    recordedAt?: Date;
    ruleReferences?: readonly string[];
  }): PostCompetitionEquipmentCheck {
    if (!EQUIPMENT_CONTROL_SELECTION_BASES.includes(props.selectionBasis)) {
      throw new Error('selectionBasis is invalid');
    }
    const expectedReferences = ruleReferencesForSelection(props.selectionBasis);
    const ruleReferences = props.ruleReferences
      ? uniqueRequiredText(props.ruleReferences, 'ruleReferences')
      : expectedReferences;
    if (ruleReferences.join('|') !== expectedReferences.join('|')) {
      throw new Error('ruleReferences do not match the selection basis');
    }
    return new PostCompetitionEquipmentCheck(
      props.id ?? crypto.randomUUID(),
      requiredText(props.championshipId, 'championshipId'),
      requiredText(props.eventId, 'eventId'),
      requiredText(props.eventName, 'eventName'),
      requiredText(props.eventType, 'eventType'),
      requiredText(props.round, 'round'),
      requiredText(props.participantId, 'participantId'),
      requiredText(props.athleteName, 'athleteName'),
      optionalText(props.startNumber),
      requiredText(props.gender, 'gender'),
      props.selectionBasis,
      requiredText(props.selectionStatement, 'selectionStatement'),
      requiredText(props.selectedBy, 'selectedBy'),
      validDate(props.selectedAt, 'selectedAt'),
      validDate(props.recordedAt ?? new Date(), 'recordedAt'),
      ruleReferences,
    );
  }

  static reconstruct(
    props: Parameters<typeof PostCompetitionEquipmentCheck.create>[0] & { id: string },
  ): PostCompetitionEquipmentCheck {
    return PostCompetitionEquipmentCheck.create(props);
  }
}

interface EquipmentControlEntryBase {
  readonly id: string;
  readonly checkId: string;
  readonly statement: string;
  readonly occurredAt: Date;
  readonly recordedAt: Date;
}

export interface EquipmentControlNoticeEntry extends EquipmentControlEntryBase {
  readonly type: 'NOTICE_ISSUED';
  readonly deliveryMethod: string;
  readonly noticeReference: string;
  readonly officialName: string;
}

export interface EquipmentControlTestEntry extends EquipmentControlEntryBase {
  readonly type: 'TEST_RECORDED';
  readonly outcome: EquipmentControlOutcome;
  readonly testedItems: readonly string[];
  readonly clothingOrTapingCheck: boolean;
  readonly sameGenderJudgeAvailable: boolean | null;
  readonly attempts: number | null;
  readonly performedBy: string;
  readonly equipmentControlJurySupervisor: string;
}

export interface EquipmentControlFailureConfirmationEntry extends EquipmentControlEntryBase {
  readonly type: 'FAILURE_CONFIRMED';
  readonly confirmsEntryId: string;
  readonly calibrationReference: string;
  readonly confirmedBy: string;
  readonly confirmerRole: EquipmentControlConfirmationRole;
  readonly testPerformedCorrectly: true;
}

export interface EquipmentControlVoidEntry extends EquipmentControlEntryBase {
  readonly type: 'CHECK_VOIDED';
  readonly officialName: string;
}

export type EquipmentControlEntry =
  | EquipmentControlNoticeEntry
  | EquipmentControlTestEntry
  | EquipmentControlFailureConfirmationEntry
  | EquipmentControlVoidEntry;

type EntryInput<T extends EquipmentControlEntry> = Omit<T, 'id' | 'occurredAt' | 'recordedAt'> & {
  id?: string;
  occurredAt: Date;
  recordedAt?: Date;
};

export function createEquipmentControlEntry(
  input:
    | EntryInput<EquipmentControlNoticeEntry>
    | EntryInput<EquipmentControlTestEntry>
    | EntryInput<EquipmentControlFailureConfirmationEntry>
    | EntryInput<EquipmentControlVoidEntry>,
): EquipmentControlEntry {
  const base = {
    id: input.id ?? crypto.randomUUID(),
    checkId: requiredText(input.checkId, 'checkId'),
    statement: requiredText(input.statement, 'statement'),
    occurredAt: validDate(input.occurredAt, 'occurredAt'),
    recordedAt: validDate(input.recordedAt ?? new Date(), 'recordedAt'),
  };
  switch (input.type) {
    case 'NOTICE_ISSUED':
      return Object.freeze({
        ...base,
        type: input.type,
        deliveryMethod: requiredText(input.deliveryMethod, 'deliveryMethod'),
        noticeReference: requiredText(input.noticeReference, 'noticeReference'),
        officialName: requiredText(input.officialName, 'officialName'),
      });
    case 'TEST_RECORDED': {
      if (!EQUIPMENT_CONTROL_OUTCOMES.includes(input.outcome)) throw new Error('outcome is invalid');
      const testedItems = uniqueRequiredText(input.testedItems, 'testedItems');
      if (input.outcome !== 'DID_NOT_REPORT' && testedItems.length === 0) {
        throw new Error('A completed test requires at least one tested item');
      }
      if (input.outcome === 'DID_NOT_REPORT' && testedItems.length > 0) {
        throw new Error('A non-report outcome cannot include tested items');
      }
      if (input.clothingOrTapingCheck && input.sameGenderJudgeAvailable !== true) {
        throw new Error('Clothing or taping checks require a same-gender judge to be available');
      }
      if (!input.clothingOrTapingCheck && input.sameGenderJudgeAvailable !== null) {
        throw new Error('sameGenderJudgeAvailable applies only to clothing or taping checks');
      }
      const attempts = input.attempts;
      if (attempts !== null && (!Number.isInteger(attempts) || attempts < 1 || attempts > 3)) {
        throw new Error('attempts must be between one and three');
      }
      return Object.freeze({
        ...base,
        type: input.type,
        outcome: input.outcome,
        testedItems: Object.freeze(testedItems),
        clothingOrTapingCheck: input.clothingOrTapingCheck,
        sameGenderJudgeAvailable: input.sameGenderJudgeAvailable,
        attempts,
        performedBy: requiredText(input.performedBy, 'performedBy'),
        equipmentControlJurySupervisor: requiredText(
          input.equipmentControlJurySupervisor,
          'equipmentControlJurySupervisor',
        ),
      });
    }
    case 'FAILURE_CONFIRMED':
      if (input.testPerformedCorrectly !== true) throw new Error('Only a correctly performed test can be confirmed');
      return Object.freeze({
        ...base,
        type: input.type,
        confirmsEntryId: requiredText(input.confirmsEntryId, 'confirmsEntryId'),
        calibrationReference: requiredText(input.calibrationReference, 'calibrationReference'),
        confirmedBy: requiredText(input.confirmedBy, 'confirmedBy'),
        confirmerRole: input.confirmerRole,
        testPerformedCorrectly: true,
      });
    case 'CHECK_VOIDED':
      return Object.freeze({
        ...base,
        type: input.type,
        officialName: requiredText(input.officialName, 'officialName'),
      });
  }
}

export type EquipmentControlCheckStatus =
  | 'SELECTED'
  | 'NOTIFIED'
  | 'PASSED'
  | 'FAILED_PENDING_CONFIRMATION'
  | 'FAILED_CONFIRMED'
  | 'DID_NOT_REPORT_PENDING_CONFIRMATION'
  | 'DID_NOT_REPORT_CONFIRMED'
  | 'VOIDED';

export function equipmentControlCheckStatus(entries: readonly EquipmentControlEntry[]): EquipmentControlCheckStatus {
  if (entries.some((entry) => entry.type === 'CHECK_VOIDED')) return 'VOIDED';
  const result = entries.find((entry): entry is EquipmentControlTestEntry => entry.type === 'TEST_RECORDED');
  if (!result) return entries.some((entry) => entry.type === 'NOTICE_ISSUED') ? 'NOTIFIED' : 'SELECTED';
  if (result.outcome === 'PASSED') return 'PASSED';
  const confirmed = entries.some((entry) => entry.type === 'FAILURE_CONFIRMED' && entry.confirmsEntryId === result.id);
  if (result.outcome === 'DID_NOT_REPORT') {
    return confirmed ? 'DID_NOT_REPORT_CONFIRMED' : 'DID_NOT_REPORT_PENDING_CONFIRMATION';
  }
  return confirmed ? 'FAILED_CONFIRMED' : 'FAILED_PENDING_CONFIRMATION';
}

export function ruleReferencesForSelection(basis: EquipmentControlSelectionBasis): readonly string[] {
  switch (basis) {
    case 'RANDOM_DRAW':
      return Object.freeze(['ISSF 6.7.9.1']);
    case 'TARGETED_CREDIBLE_EVIDENCE':
      return Object.freeze(['ISSF 6.7.9.1', 'ISSF 6.7.9.4']);
    case 'QUALIFICATION_FINALIST_TOP_10':
      return Object.freeze(['ISSF 6.7.9.1', 'ISSF 6.7.9.5', 'ISSF 8.7.7']);
    case 'PISTOL_TRIGGER_RANDOM_DRAW':
      return Object.freeze(['ISSF 6.7.9.1', 'ISSF 8.4.2.3']);
  }
}

function requiredText(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}

function uniqueRequiredText(values: readonly string[], name: string): string[] {
  return [...new Set(values.map((value) => requiredText(value, name)))];
}

function optionalText(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function validDate(value: Date, name: string): Date {
  if (!Number.isFinite(value.getTime())) throw new Error(`${name} must be valid`);
  return new Date(value.getTime());
}
