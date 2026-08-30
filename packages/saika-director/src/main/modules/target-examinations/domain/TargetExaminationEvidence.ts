export const TARGET_EXAMINATION_EVIDENCE_TYPES = [
  'CONTROL_SHEET',
  'BACKING_CARD',
  'BACKING_TARGET',
  'WITNESS_STRIP',
  'RUBBER_BAND',
  'RANGE_INCIDENT_REPORT',
  'EST_LOG_PRINT',
  'EST_COMPUTER_RECORD',
  'TARGET_FACE',
  'OTHER',
] as const;

export type TargetExaminationEvidenceType = (typeof TARGET_EXAMINATION_EVIDENCE_TYPES)[number];

export interface CreateTargetExaminationEvidenceProps {
  caseId: string;
  type: TargetExaminationEvidenceType;
  description: string;
  reference?: string;
  contentHashSha256?: string;
  collectedBy: string;
  collectedAt: Date;
  recordedAt?: Date;
}

/** Immutable chain-of-custody record for one examination item. */
export class TargetExaminationEvidence {
  private constructor(
    readonly id: string,
    readonly caseId: string,
    readonly type: TargetExaminationEvidenceType,
    readonly description: string,
    readonly reference: string | null,
    readonly contentHashSha256: string | null,
    readonly collectedBy: string,
    readonly collectedAt: Date,
    readonly recordedAt: Date,
  ) {
    Object.freeze(this);
  }

  static create(props: CreateTargetExaminationEvidenceProps): TargetExaminationEvidence {
    validateType(props.type);
    const collectedAt = validDate(props.collectedAt, 'collectedAt');
    const recordedAt = validDate(props.recordedAt ?? new Date(), 'recordedAt');
    const hash = normalizeOptional(props.contentHashSha256)?.toLowerCase() ?? null;
    if (hash !== null && !/^[a-f0-9]{64}$/.test(hash)) {
      throw new Error('contentHashSha256 must contain 64 hexadecimal characters');
    }
    return new TargetExaminationEvidence(
      crypto.randomUUID(),
      requiredText(props.caseId, 'caseId'),
      props.type,
      requiredText(props.description, 'description'),
      normalizeOptional(props.reference),
      hash,
      requiredText(props.collectedBy, 'collectedBy'),
      collectedAt,
      recordedAt,
    );
  }

  static reconstruct(props: {
    id: string;
    caseId: string;
    type: TargetExaminationEvidenceType;
    description: string;
    reference: string | null;
    contentHashSha256: string | null;
    collectedBy: string;
    collectedAt: Date;
    recordedAt: Date;
  }): TargetExaminationEvidence {
    validateType(props.type);
    return new TargetExaminationEvidence(
      props.id,
      props.caseId,
      props.type,
      props.description,
      props.reference,
      props.contentHashSha256,
      props.collectedBy,
      new Date(props.collectedAt.getTime()),
      new Date(props.recordedAt.getTime()),
    );
  }
}

function validateType(value: TargetExaminationEvidenceType): void {
  if (!TARGET_EXAMINATION_EVIDENCE_TYPES.includes(value)) throw new Error('evidence type is invalid');
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
