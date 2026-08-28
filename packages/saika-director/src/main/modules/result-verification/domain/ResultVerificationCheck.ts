export const RESULT_EVIDENCE_SOURCES = ['TARGET_PRINTOUT', 'INDEPENDENT_MEMORY', 'OTHER'] as const;
export const RESULT_COMPARISON_STATUSES = ['MATCHED', 'MISMATCH', 'UNAVAILABLE'] as const;

export type ResultEvidenceSource = (typeof RESULT_EVIDENCE_SOURCES)[number];
export type ResultComparisonStatus = (typeof RESULT_COMPARISON_STATUSES)[number];

export interface CreateResultVerificationCheckProps {
  eventId: string;
  resultId: string;
  participantId: string;
  playerName: string;
  resultRevision: string;
  resultRank: number;
  scoreX10: number;
  decisionCountAtCheck: number;
  evidenceSource: ResultEvidenceSource;
  evidenceReference: string;
  comparisonStatus: ResultComparisonStatus;
  manualInterventionsReviewed: boolean;
  note?: string;
  officialName: string;
  checkedAt?: Date;
}

/** Immutable evidence that an RTS Jury member compared one result revision. */
export class ResultVerificationCheck {
  private constructor(
    readonly id: string,
    readonly eventId: string,
    readonly resultId: string,
    readonly participantId: string,
    readonly playerName: string,
    readonly resultRevision: string,
    readonly resultRank: number,
    readonly scoreX10: number,
    readonly decisionCountAtCheck: number,
    readonly evidenceSource: ResultEvidenceSource,
    readonly evidenceReference: string,
    readonly comparisonStatus: ResultComparisonStatus,
    readonly manualInterventionsReviewed: boolean,
    readonly note: string | null,
    readonly officialName: string,
    readonly checkedAt: Date,
  ) {
    Object.freeze(this);
  }

  static create(props: CreateResultVerificationCheckProps): ResultVerificationCheck {
    validate(props);
    return new ResultVerificationCheck(
      crypto.randomUUID(),
      props.eventId,
      props.resultId,
      props.participantId,
      props.playerName.trim(),
      props.resultRevision,
      props.resultRank,
      props.scoreX10,
      props.decisionCountAtCheck,
      props.evidenceSource,
      props.evidenceReference.trim(),
      props.comparisonStatus,
      props.manualInterventionsReviewed,
      normalizeOptional(props.note),
      props.officialName.trim(),
      new Date((props.checkedAt ?? new Date()).getTime()),
    );
  }

  static reconstruct(props: CreateResultVerificationCheckProps & { id: string }): ResultVerificationCheck {
    return new ResultVerificationCheck(
      props.id,
      props.eventId,
      props.resultId,
      props.participantId,
      props.playerName,
      props.resultRevision,
      props.resultRank,
      props.scoreX10,
      props.decisionCountAtCheck,
      props.evidenceSource,
      props.evidenceReference,
      props.comparisonStatus,
      props.manualInterventionsReviewed,
      props.note ?? null,
      props.officialName,
      new Date((props.checkedAt ?? new Date()).getTime()),
    );
  }
}

function validate(props: CreateResultVerificationCheckProps): void {
  for (const [name, value] of [
    ['eventId', props.eventId],
    ['resultId', props.resultId],
    ['participantId', props.participantId],
    ['playerName', props.playerName],
    ['evidenceReference', props.evidenceReference],
    ['officialName', props.officialName],
  ] as const) {
    if (value.trim().length === 0) throw new Error(`${name} is required`);
  }
  if (!/^[a-f0-9]{64}$/.test(props.resultRevision)) throw new Error('resultRevision must be a SHA-256 digest');
  if (!Number.isInteger(props.resultRank) || props.resultRank < 1) throw new Error('resultRank must be positive');
  if (!Number.isInteger(props.scoreX10) || props.scoreX10 < 0) throw new Error('scoreX10 must be non-negative');
  if (!Number.isInteger(props.decisionCountAtCheck) || props.decisionCountAtCheck < 0) {
    throw new Error('decisionCountAtCheck must be non-negative');
  }
  const checkedAt = props.checkedAt ?? new Date();
  if (!Number.isFinite(checkedAt.getTime())) throw new Error('checkedAt must be valid');
}

function normalizeOptional(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}
