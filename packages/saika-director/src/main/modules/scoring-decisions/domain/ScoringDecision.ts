export const SCORING_DECISION_TYPES = [
  'DEDUCTION',
  'ANNUL_SHOT',
  'MARK_MISS',
  'WARNING',
  'DISQUALIFICATION',
  'REMARK',
  'MALFUNCTION',
  'EXTRA_TIME',
  'REPEAT_SHOT',
  'REPEAT_SERIES',
  'REVOCATION',
] as const;

export const SCORING_APPLICATION_POLICIES = ['NONE', 'SPECIFIC_SHOT', 'LOWEST_SHOT_IN_SERIES'] as const;

export const SCORING_CLASSIFICATION_CODES = ['DSQ', 'DQB', 'AD_DSQ'] as const;

export type ScoringDecisionType = (typeof SCORING_DECISION_TYPES)[number];
export type ScoringApplicationPolicy = (typeof SCORING_APPLICATION_POLICIES)[number];
export type ScoringClassificationCode = (typeof SCORING_CLASSIFICATION_CODES)[number];
export type ScoringResultScope = 'QUALIFICATION' | 'FINAL';

export interface ScoringDecisionTarget {
  eventId: string;
  participantId: string;
  relayNumber: number;
  resultScope: ScoringResultScope;
  resultIdAtDecision: string;
  sourceCompetitionId: string | null;
}

export interface CreateScoringDecisionProps extends ScoringDecisionTarget {
  type: Exclude<ScoringDecisionType, 'REVOCATION'>;
  applicationPolicy: ScoringApplicationPolicy;
  pointsX10?: number;
  seriesIndex?: number;
  shotIndex?: number;
  classificationCode?: ScoringClassificationCode;
  ruleReference: string;
  incidentReportNumber?: string;
  publicRemark: string;
  internalNote?: string;
  officialName: string;
  decidedAt?: Date;
}

/** Immutable, append-only official scoring judgement. */
export class ScoringDecision {
  private constructor(
    readonly id: string,
    readonly eventId: string,
    readonly participantId: string,
    readonly relayNumber: number,
    readonly resultScope: ScoringResultScope,
    readonly resultIdAtDecision: string,
    readonly sourceCompetitionId: string | null,
    readonly type: ScoringDecisionType,
    readonly applicationPolicy: ScoringApplicationPolicy,
    readonly pointsX10: number | null,
    readonly seriesIndex: number | null,
    readonly shotIndex: number | null,
    readonly classificationCode: ScoringClassificationCode | null,
    readonly ruleReference: string,
    readonly incidentReportNumber: string | null,
    readonly publicRemark: string,
    readonly internalNote: string | null,
    readonly officialName: string,
    readonly decidedAt: Date,
    readonly reversesDecisionId: string | null,
  ) {
    Object.freeze(this);
  }

  static create(props: CreateScoringDecisionProps): ScoringDecision {
    validateCommon(props);
    validateApplication(props);
    return new ScoringDecision(
      crypto.randomUUID(),
      props.eventId,
      props.participantId,
      props.relayNumber,
      props.resultScope,
      props.resultIdAtDecision,
      props.sourceCompetitionId,
      props.type,
      props.applicationPolicy,
      props.pointsX10 ?? null,
      props.seriesIndex ?? null,
      props.shotIndex ?? null,
      props.classificationCode ?? null,
      props.ruleReference.trim(),
      normalizeOptional(props.incidentReportNumber),
      props.publicRemark.trim(),
      normalizeOptional(props.internalNote),
      props.officialName.trim(),
      new Date((props.decidedAt ?? new Date()).getTime()),
      null,
    );
  }

  static createRevocation(
    props: ScoringDecisionTarget & {
      reversesDecisionId: string;
      ruleReference: string;
      incidentReportNumber?: string;
      reason: string;
      internalNote?: string;
      officialName: string;
      decidedAt?: Date;
    },
  ): ScoringDecision {
    validateCommon({ ...props, publicRemark: props.reason });
    if (props.reversesDecisionId.trim().length === 0) throw new Error('reversesDecisionId is required');
    return new ScoringDecision(
      crypto.randomUUID(),
      props.eventId,
      props.participantId,
      props.relayNumber,
      props.resultScope,
      props.resultIdAtDecision,
      props.sourceCompetitionId,
      'REVOCATION',
      'NONE',
      null,
      null,
      null,
      null,
      props.ruleReference.trim(),
      normalizeOptional(props.incidentReportNumber),
      props.reason.trim(),
      normalizeOptional(props.internalNote),
      props.officialName.trim(),
      new Date((props.decidedAt ?? new Date()).getTime()),
      props.reversesDecisionId,
    );
  }

  static reconstruct(data: {
    id: string;
    eventId: string;
    participantId: string;
    relayNumber: number;
    resultScope: ScoringResultScope;
    resultIdAtDecision: string;
    sourceCompetitionId: string | null;
    type: ScoringDecisionType;
    applicationPolicy: ScoringApplicationPolicy;
    pointsX10: number | null;
    seriesIndex: number | null;
    shotIndex: number | null;
    classificationCode: ScoringClassificationCode | null;
    ruleReference: string;
    incidentReportNumber: string | null;
    publicRemark: string;
    internalNote: string | null;
    officialName: string;
    decidedAt: Date;
    reversesDecisionId: string | null;
  }): ScoringDecision {
    return new ScoringDecision(
      data.id,
      data.eventId,
      data.participantId,
      data.relayNumber,
      data.resultScope,
      data.resultIdAtDecision,
      data.sourceCompetitionId,
      data.type,
      data.applicationPolicy,
      data.pointsX10,
      data.seriesIndex,
      data.shotIndex,
      data.classificationCode,
      data.ruleReference,
      data.incidentReportNumber,
      data.publicRemark,
      data.internalNote,
      data.officialName,
      data.decidedAt,
      data.reversesDecisionId,
    );
  }
}

function validateCommon(props: {
  eventId: string;
  participantId: string;
  relayNumber: number;
  resultScope: ScoringResultScope;
  resultIdAtDecision: string;
  sourceCompetitionId: string | null;
  ruleReference: string;
  publicRemark: string;
  officialName: string;
  decidedAt?: Date;
}): void {
  if (!Number.isInteger(props.relayNumber) || props.relayNumber < 1) throw new Error('relayNumber must be positive');
  if (props.eventId.trim().length === 0 || props.participantId.trim().length === 0) {
    throw new Error('A decision target is required');
  }
  if (props.resultIdAtDecision.trim().length === 0) throw new Error('resultIdAtDecision is required');
  if (props.ruleReference.trim().length === 0) throw new Error('ruleReference is required');
  if (props.publicRemark.trim().length === 0) throw new Error('publicRemark is required');
  if (props.officialName.trim().length === 0) throw new Error('officialName is required');
  if (props.decidedAt !== undefined && !Number.isFinite(props.decidedAt.getTime())) {
    throw new Error('decidedAt must be valid');
  }
}

function validateApplication(props: CreateScoringDecisionProps): void {
  const validSeriesIndex =
    props.seriesIndex !== undefined && Number.isInteger(props.seriesIndex) && props.seriesIndex >= 0;
  const validShotIndex = props.shotIndex !== undefined && Number.isInteger(props.shotIndex) && props.shotIndex >= 0;

  if (props.type === 'DEDUCTION') {
    if (!Number.isInteger(props.pointsX10) || (props.pointsX10 ?? 0) <= 0) {
      throw new Error('A deduction requires positive integer pointsX10');
    }
    if (!validSeriesIndex) throw new Error('A deduction requires seriesIndex');
    if (!['SPECIFIC_SHOT', 'LOWEST_SHOT_IN_SERIES'].includes(props.applicationPolicy)) {
      throw new Error('A deduction requires a shot application policy');
    }
    if (props.applicationPolicy === 'SPECIFIC_SHOT' && !validShotIndex) {
      throw new Error('A specific-shot deduction requires shotIndex');
    }
  } else if (props.type === 'ANNUL_SHOT' || props.type === 'MARK_MISS') {
    if (props.applicationPolicy !== 'SPECIFIC_SHOT' || !validSeriesIndex || !validShotIndex) {
      throw new Error(`${props.type} requires a specific shot and series`);
    }
  } else if (props.type === 'DISQUALIFICATION') {
    if (props.applicationPolicy !== 'NONE' || props.classificationCode === undefined) {
      throw new Error('A disqualification requires a classification code and no score application policy');
    }
  } else if (props.applicationPolicy !== 'NONE') {
    throw new Error(`${props.type} does not accept a score application policy`);
  }

  if (props.type !== 'DEDUCTION' && props.pointsX10 !== undefined) {
    throw new Error('pointsX10 is only valid for deductions');
  }
  if (props.type !== 'DISQUALIFICATION' && props.classificationCode !== undefined) {
    throw new Error('classificationCode is only valid for disqualification');
  }
}

function normalizeOptional(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

/** Returns current decisions without erasing the append-only revocation history. */
export function getActiveScoringDecisions(decisions: readonly ScoringDecision[]): ScoringDecision[] {
  const reversed = new Set(
    decisions
      .filter((decision) => decision.type === 'REVOCATION' && decision.reversesDecisionId !== null)
      .map((decision) => decision.reversesDecisionId as string),
  );
  return decisions.filter((decision) => decision.type !== 'REVOCATION' && !reversed.has(decision.id));
}
