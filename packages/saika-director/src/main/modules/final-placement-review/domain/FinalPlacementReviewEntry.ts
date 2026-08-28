export type FinalPlacementReviewEntryType = 'REVIEW' | 'REVOCATION';

export interface FinalPlacementAssignment {
  readonly resultId: string;
  readonly participantId: string;
  readonly rank: number;
}

export interface CreateFinalPlacementReviewProps {
  eventId: string;
  scoringRevision: string;
  placements: readonly FinalPlacementAssignment[];
  ruleReference: string;
  statement: string;
  officialName: string;
  recordedAt?: Date;
}

/** Immutable Final placement review or a linked revocation in an append-only event stream. */
export class FinalPlacementReviewEntry {
  private constructor(
    readonly id: string,
    readonly eventId: string,
    readonly type: FinalPlacementReviewEntryType,
    readonly scoringRevision: string,
    readonly placements: readonly FinalPlacementAssignment[],
    readonly ruleReference: string,
    readonly statement: string,
    readonly officialName: string,
    readonly recordedAt: Date,
    readonly reversesReviewId: string | null,
  ) {
    for (const placement of placements) Object.freeze(placement);
    Object.freeze(this.placements);
    Object.freeze(this);
  }

  static createReview(props: CreateFinalPlacementReviewProps): FinalPlacementReviewEntry {
    validateReview(props);
    return new FinalPlacementReviewEntry(
      crypto.randomUUID(),
      props.eventId.trim(),
      'REVIEW',
      props.scoringRevision,
      props.placements.map((placement) => ({ ...placement })),
      props.ruleReference.trim(),
      props.statement.trim(),
      props.officialName.trim(),
      validDate(props.recordedAt),
      null,
    );
  }

  static createRevocation(
    review: FinalPlacementReviewEntry,
    props: { ruleReference: string; reason: string; officialName: string; recordedAt?: Date },
  ): FinalPlacementReviewEntry {
    if (review.type !== 'REVIEW') throw new Error('Only a Final placement review can be revoked');
    validateText(props.ruleReference, 'ruleReference');
    validateText(props.reason, 'reason');
    validateText(props.officialName, 'officialName');
    return new FinalPlacementReviewEntry(
      crypto.randomUUID(),
      review.eventId,
      'REVOCATION',
      review.scoringRevision,
      review.placements.map((placement) => ({ ...placement })),
      props.ruleReference.trim(),
      props.reason.trim(),
      props.officialName.trim(),
      validDate(props.recordedAt),
      review.id,
    );
  }

  static reconstruct(props: {
    id: string;
    eventId: string;
    type: FinalPlacementReviewEntryType;
    scoringRevision: string;
    placements: readonly FinalPlacementAssignment[];
    ruleReference: string;
    statement: string;
    officialName: string;
    recordedAt: Date;
    reversesReviewId: string | null;
  }): FinalPlacementReviewEntry {
    return new FinalPlacementReviewEntry(
      props.id,
      props.eventId,
      props.type,
      props.scoringRevision,
      props.placements.map((placement) => ({ ...placement })),
      props.ruleReference,
      props.statement,
      props.officialName,
      new Date(props.recordedAt.getTime()),
      props.reversesReviewId,
    );
  }
}

/** The latest review is authoritative unless a later entry explicitly revokes it. */
export function getCurrentFinalPlacementReview(
  entries: readonly FinalPlacementReviewEntry[],
): FinalPlacementReviewEntry | null {
  let current: FinalPlacementReviewEntry | null = null;
  for (const entry of entries) {
    if (entry.type === 'REVIEW') current = entry;
    if (entry.type === 'REVOCATION' && current?.id === entry.reversesReviewId) current = null;
  }
  return current;
}

function validateReview(props: CreateFinalPlacementReviewProps): void {
  validateText(props.eventId, 'eventId');
  if (!/^[a-f0-9]{64}$/.test(props.scoringRevision)) {
    throw new Error('scoringRevision must be a SHA-256 digest');
  }
  validateText(props.ruleReference, 'ruleReference');
  validateText(props.statement, 'statement');
  validateText(props.officialName, 'officialName');
  const resultIds = new Set<string>();
  const participantIds = new Set<string>();
  const ranks = new Set<number>();
  for (const placement of props.placements) {
    validateText(placement.resultId, 'placement.resultId');
    validateText(placement.participantId, 'placement.participantId');
    if (!Number.isInteger(placement.rank) || placement.rank < 1) {
      throw new Error('Placement ranks must be positive integers');
    }
    if (resultIds.has(placement.resultId) || participantIds.has(placement.participantId)) {
      throw new Error('Every result and participant must have exactly one placement');
    }
    if (ranks.has(placement.rank)) throw new Error('Final placement ranks must be unique');
    resultIds.add(placement.resultId);
    participantIds.add(placement.participantId);
    ranks.add(placement.rank);
  }
  validDate(props.recordedAt);
}

function validateText(value: string, name: string): void {
  if (value.trim().length === 0) throw new Error(`${name} is required`);
}

function validDate(value: Date | undefined): Date {
  const date = value ?? new Date();
  if (!Number.isFinite(date.getTime())) throw new Error('recordedAt must be valid');
  return new Date(date.getTime());
}
