export const TARGET_EXAMINATION_ISSUE_KINDS = [
  'SIGHTING_COMPLAINT',
  'NO_SHOT_INDICATION',
  'UNEXPECTED_ZERO',
  'SCORE_VALUE_PROTEST',
  'PAPER_OR_RUBBER_FAILURE',
  'SINGLE_TARGET_FAILURE',
  'RANGE_TARGET_FAILURE',
  'OTHER',
] as const;

export type TargetExaminationIssueKind = (typeof TARGET_EXAMINATION_ISSUE_KINDS)[number];

export interface CreateTargetExaminationCaseProps {
  issueKind: TargetExaminationIssueKind;
  occurredAt: Date;
  laneId?: string;
  firingPointNumber?: number;
  relayNumber?: number;
  athleteName?: string;
  shotId?: string;
  summary: string;
  details: string;
  ruleReferences: string;
  openedBy: string;
  createdAt?: Date;
}

/** Immutable facts captured when an EST target examination starts. */
export class TargetExaminationCase {
  private constructor(
    readonly id: string,
    readonly issueKind: TargetExaminationIssueKind,
    readonly occurredAt: Date,
    readonly laneId: string | null,
    readonly firingPointNumber: number | null,
    readonly relayNumber: number | null,
    readonly athleteName: string | null,
    readonly shotId: string | null,
    readonly summary: string,
    readonly details: string,
    readonly ruleReferences: string,
    readonly openedBy: string,
    readonly createdAt: Date,
  ) {
    Object.freeze(this);
  }

  static create(props: CreateTargetExaminationCaseProps): TargetExaminationCase {
    validateIssueKind(props.issueKind);
    const occurredAt = validDate(props.occurredAt, 'occurredAt');
    const createdAt = validDate(props.createdAt ?? new Date(), 'createdAt');
    validPositiveInteger(props.firingPointNumber, 'firingPointNumber');
    validPositiveInteger(props.relayNumber, 'relayNumber');

    return new TargetExaminationCase(
      crypto.randomUUID(),
      props.issueKind,
      occurredAt,
      normalizeOptional(props.laneId),
      props.firingPointNumber ?? null,
      props.relayNumber ?? null,
      normalizeOptional(props.athleteName),
      normalizeOptional(props.shotId),
      requiredText(props.summary, 'summary'),
      requiredText(props.details, 'details'),
      requiredText(props.ruleReferences, 'ruleReferences'),
      requiredText(props.openedBy, 'openedBy'),
      createdAt,
    );
  }

  static reconstruct(props: {
    id: string;
    issueKind: TargetExaminationIssueKind;
    occurredAt: Date;
    laneId: string | null;
    firingPointNumber: number | null;
    relayNumber: number | null;
    athleteName: string | null;
    shotId: string | null;
    summary: string;
    details: string;
    ruleReferences: string;
    openedBy: string;
    createdAt: Date;
  }): TargetExaminationCase {
    validateIssueKind(props.issueKind);
    return new TargetExaminationCase(
      requiredText(props.id, 'id'),
      props.issueKind,
      validDate(props.occurredAt, 'occurredAt'),
      props.laneId,
      props.firingPointNumber,
      props.relayNumber,
      props.athleteName,
      props.shotId,
      props.summary,
      props.details,
      props.ruleReferences,
      props.openedBy,
      validDate(props.createdAt, 'createdAt'),
    );
  }
}

function validateIssueKind(value: TargetExaminationIssueKind): void {
  if (!TARGET_EXAMINATION_ISSUE_KINDS.includes(value)) throw new Error('issueKind is invalid');
}

function validPositiveInteger(value: number | undefined, name: string): void {
  if (value !== undefined && (!Number.isInteger(value) || value < 1)) {
    throw new Error(`${name} must be positive`);
  }
}

function validDate(value: Date, name: string): Date {
  if (!Number.isFinite(value.getTime())) throw new Error(`${name} must be valid`);
  return new Date(value.getTime());
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
