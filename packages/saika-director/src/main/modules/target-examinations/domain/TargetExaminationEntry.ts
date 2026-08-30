export const TARGET_EXAMINATION_ENTRY_TYPES = [
  'NOTE',
  'DECISION',
  'HOLD_RELEASED',
  'HOLD_REINSTATED',
  'CLOSED',
  'REOPENED',
  'VOID',
] as const;

export type TargetExaminationEntryType = (typeof TARGET_EXAMINATION_ENTRY_TYPES)[number];
export type TargetExaminationStatus = 'OPEN' | 'CLOSED' | 'VOID';

interface CreateTargetExaminationEntryProps {
  caseId: string;
  type: TargetExaminationEntryType;
  statement: string;
  ruleReference?: string;
  officialName: string;
  recordedAt?: Date;
}

/** Immutable audit entry appended to a target-examination case. */
export class TargetExaminationEntry {
  private constructor(
    readonly id: string,
    readonly caseId: string,
    readonly type: TargetExaminationEntryType,
    readonly statement: string,
    readonly ruleReference: string | null,
    readonly officialName: string,
    readonly recordedAt: Date,
  ) {
    Object.freeze(this);
  }

  static create(props: CreateTargetExaminationEntryProps): TargetExaminationEntry {
    if (!TARGET_EXAMINATION_ENTRY_TYPES.includes(props.type)) throw new Error('entry type is invalid');
    const ruleReference = normalizeOptional(props.ruleReference);
    if (props.type === 'DECISION' && ruleReference === null) {
      throw new Error('ruleReference is required for a decision');
    }
    const recordedAt = props.recordedAt ?? new Date();
    if (!Number.isFinite(recordedAt.getTime())) throw new Error('recordedAt must be valid');
    return new TargetExaminationEntry(
      crypto.randomUUID(),
      requiredText(props.caseId, 'caseId'),
      props.type,
      requiredText(props.statement, 'statement'),
      ruleReference,
      requiredText(props.officialName, 'officialName'),
      new Date(recordedAt.getTime()),
    );
  }

  static reconstruct(props: {
    id: string;
    caseId: string;
    type: TargetExaminationEntryType;
    statement: string;
    ruleReference: string | null;
    officialName: string;
    recordedAt: Date;
  }): TargetExaminationEntry {
    return new TargetExaminationEntry(
      props.id,
      props.caseId,
      props.type,
      props.statement,
      props.ruleReference,
      props.officialName,
      new Date(props.recordedAt.getTime()),
    );
  }
}

export interface TargetExaminationState {
  status: TargetExaminationStatus;
  evidenceHoldActive: boolean;
}

/** Derives mutable workflow state exclusively from append order. */
export function getTargetExaminationState(entries: readonly TargetExaminationEntry[]): TargetExaminationState {
  let status: TargetExaminationStatus = 'OPEN';
  let evidenceHoldActive = true;

  for (const entry of entries) {
    switch (entry.type) {
      case 'HOLD_RELEASED':
        evidenceHoldActive = false;
        break;
      case 'HOLD_REINSTATED':
        evidenceHoldActive = true;
        break;
      case 'CLOSED':
        status = 'CLOSED';
        break;
      case 'REOPENED':
        status = 'OPEN';
        evidenceHoldActive = true;
        break;
      case 'VOID':
        status = 'VOID';
        evidenceHoldActive = false;
        break;
      case 'NOTE':
      case 'DECISION':
        break;
    }
  }

  return { status, evidenceHoldActive };
}

function requiredText(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}

function normalizeOptional(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}
