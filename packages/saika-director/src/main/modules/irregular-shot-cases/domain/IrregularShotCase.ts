import type { CompetitionShotObservation } from '@/main/modules/mqtt';

export const FINAL_SERIES_IRREGULAR_SHOT_KINDS = [
  'LATE_OR_UNFIRED_SHOT',
  'MULTIPLE_SHOTS_SAME_TARGET',
  'READY_POSITION',
] as const;
export const IRREGULAR_SHOT_KINDS = [
  'EXCESS_SHOTS',
  'CROSS_FIRE',
  'DISPUTED_SHOT',
  ...FINAL_SERIES_IRREGULAR_SHOT_KINDS,
] as const;
export const IRREGULAR_SHOT_EVIDENCE_RELATIONS = ['SUBJECT', 'POSSIBLE_SOURCE', 'RECIPIENT', 'CONTEXT'] as const;
export const IRREGULAR_SHOT_ENTRY_TYPES = ['NOTE', 'REFERRED', 'RESOLVED', 'REOPENED', 'CLOSED', 'VOID'] as const;
export const IRREGULAR_SHOT_RESOLUTION_CODES = [
  'EXCESS_IDENTIFIED',
  'EXCESS_UNIDENTIFIED',
  'CROSS_FIRE_CONFIRMED',
  'RECEIVED_CROSS_FIRE_CONFIRMED',
  'SHOT_ANNULLED',
  'SHOT_CREDITED',
  'HIT_PENALTY_APPLIED',
  'DISQUALIFICATION_APPLIED',
  'NO_SCORE_CHANGE',
] as const;

export type IrregularShotKind = (typeof IRREGULAR_SHOT_KINDS)[number];
export type IrregularShotEvidenceRelation = (typeof IRREGULAR_SHOT_EVIDENCE_RELATIONS)[number];
export type IrregularShotEntryType = (typeof IRREGULAR_SHOT_ENTRY_TYPES)[number];
export type IrregularShotResolutionCode = (typeof IRREGULAR_SHOT_RESOLUTION_CODES)[number];
export type IrregularShotCaseStatus = 'OPEN' | 'REFERRED' | 'RESOLVED' | 'CLOSED' | 'VOID';
export type IrregularShotResultScope = 'QUALIFICATION' | 'FINAL';

export class IrregularShotCase {
  private constructor(
    readonly id: string,
    readonly eventId: string,
    readonly competitionId: string,
    readonly resultScope: IrregularShotResultScope,
    readonly kind: IrregularShotKind,
    readonly subjectLaneId: string,
    readonly adjacentLaneIds: readonly string[],
    readonly windowStartAt: Date,
    readonly windowEndAt: Date,
    readonly summary: string,
    readonly ruleReference: string,
    readonly openedBy: string,
    readonly occurredAt: Date,
    readonly createdAt: Date,
  ) {
    Object.freeze(this.adjacentLaneIds);
    Object.freeze(this);
  }

  static create(props: {
    id?: string;
    eventId: string;
    competitionId: string;
    resultScope: IrregularShotResultScope;
    kind: IrregularShotKind;
    subjectLaneId: string;
    adjacentLaneIds: readonly string[];
    windowStartAt: Date;
    windowEndAt: Date;
    summary: string;
    ruleReference?: string;
    openedBy: string;
    occurredAt: Date;
    createdAt?: Date;
  }): IrregularShotCase {
    if (!IRREGULAR_SHOT_KINDS.includes(props.kind)) throw new Error('Irregular shot kind is invalid');
    if (
      FINAL_SERIES_IRREGULAR_SHOT_KINDS.includes(props.kind as (typeof FINAL_SERIES_IRREGULAR_SHOT_KINDS)[number]) &&
      props.resultScope !== 'FINAL'
    ) {
      throw new Error('A Final-series irregular shot kind requires FINAL result scope');
    }
    const subjectLaneId = requiredText(props.subjectLaneId, 'subjectLaneId');
    const adjacentLaneIds = [...new Set(props.adjacentLaneIds.map((value) => requiredText(value, 'adjacentLaneId')))];
    if (adjacentLaneIds.includes(subjectLaneId)) throw new Error('The subject Lane cannot also be an adjacent Lane');
    const windowStartAt = validDate(props.windowStartAt, 'windowStartAt');
    const windowEndAt = validDate(props.windowEndAt, 'windowEndAt');
    if (windowEndAt.getTime() < windowStartAt.getTime()) throw new Error('Evidence window end must not precede start');
    if (windowEndAt.getTime() - windowStartAt.getTime() > 30 * 60_000) {
      throw new Error('Evidence window must not exceed 30 minutes');
    }
    const defaultRule = defaultRuleReference(props.kind);
    return new IrregularShotCase(
      props.id ?? crypto.randomUUID(),
      requiredText(props.eventId, 'eventId'),
      requiredText(props.competitionId, 'competitionId'),
      props.resultScope,
      props.kind,
      subjectLaneId,
      adjacentLaneIds,
      windowStartAt,
      windowEndAt,
      requiredText(props.summary, 'summary'),
      requiredText(props.ruleReference ?? defaultRule, 'ruleReference'),
      requiredText(props.openedBy, 'openedBy'),
      validDate(props.occurredAt, 'occurredAt'),
      validDate(props.createdAt ?? new Date(), 'createdAt'),
    );
  }

  static reconstruct(props: Parameters<typeof IrregularShotCase.create>[0] & { id: string; createdAt: Date }) {
    return IrregularShotCase.create(props);
  }
}

function defaultRuleReference(kind: IrregularShotKind): string {
  switch (kind) {
    case 'EXCESS_SHOTS':
      return 'ISSF 6.11.5';
    case 'CROSS_FIRE':
    case 'DISPUTED_SHOT':
      return 'ISSF 6.11.6';
    case 'LATE_OR_UNFIRED_SHOT':
    case 'MULTIPLE_SHOTS_SAME_TARGET':
      return 'ISSF 6.17.4(m)';
    case 'READY_POSITION':
      return 'ISSF 6.17.4(n) / 6.17.5(j)';
  }
}

export class IrregularShotEvidence {
  private constructor(
    readonly id: string,
    readonly caseId: string,
    readonly relation: IrregularShotEvidenceRelation,
    readonly observationId: string,
    readonly shotId: string,
    readonly laneId: string,
    readonly sessionId: string,
    readonly stageIndex: number,
    readonly seriesIndex: number,
    readonly shotNumberInSeries: number,
    readonly mode: 'SIGHTING' | 'MATCH',
    readonly effectiveScoreX10: number,
    readonly firedAt: Date,
    readonly receivedAt: Date,
    readonly statement: string,
    readonly officialName: string,
    readonly recordedAt: Date,
  ) {
    Object.freeze(this);
  }

  static fromObservation(props: {
    id?: string;
    caseId: string;
    relation: IrregularShotEvidenceRelation;
    observation: CompetitionShotObservation;
    statement?: string;
    officialName: string;
    recordedAt?: Date;
  }): IrregularShotEvidence {
    if (!IRREGULAR_SHOT_EVIDENCE_RELATIONS.includes(props.relation)) {
      throw new Error('Irregular shot evidence relation is invalid');
    }
    return new IrregularShotEvidence(
      props.id ?? crypto.randomUUID(),
      requiredText(props.caseId, 'caseId'),
      props.relation,
      props.observation.id,
      props.observation.shotId,
      props.observation.laneId,
      props.observation.sessionId,
      props.observation.stageIndex,
      props.observation.seriesIndex,
      props.observation.shotNumberInSeries,
      props.observation.mode,
      props.observation.effectiveScoreX10,
      props.observation.firedAt,
      props.observation.receivedAt,
      optionalText(props.statement) ?? 'Observation linked as case evidence',
      requiredText(props.officialName, 'officialName'),
      validDate(props.recordedAt ?? new Date(), 'recordedAt'),
    );
  }

  static reconstruct(props: {
    id: string;
    caseId: string;
    relation: IrregularShotEvidenceRelation;
    observationId: string;
    shotId: string;
    laneId: string;
    sessionId: string;
    stageIndex: number;
    seriesIndex: number;
    shotNumberInSeries: number;
    mode: 'SIGHTING' | 'MATCH';
    effectiveScoreX10: number;
    firedAt: Date;
    receivedAt: Date;
    statement: string;
    officialName: string;
    recordedAt: Date;
  }): IrregularShotEvidence {
    return new IrregularShotEvidence(
      props.id,
      props.caseId,
      props.relation,
      props.observationId,
      props.shotId,
      props.laneId,
      props.sessionId,
      props.stageIndex,
      props.seriesIndex,
      props.shotNumberInSeries,
      props.mode,
      props.effectiveScoreX10,
      validDate(props.firedAt, 'firedAt'),
      validDate(props.receivedAt, 'receivedAt'),
      props.statement,
      props.officialName,
      validDate(props.recordedAt, 'recordedAt'),
    );
  }
}

export class IrregularShotCaseEntry {
  private constructor(
    readonly id: string,
    readonly caseId: string,
    readonly type: IrregularShotEntryType,
    readonly statement: string,
    readonly officialName: string,
    readonly ruleReference: string | null,
    readonly resolutionCode: IrregularShotResolutionCode | null,
    readonly incidentReportId: string | null,
    readonly scoringDecisionIds: readonly string[],
    readonly occurredAt: Date,
    readonly recordedAt: Date,
  ) {
    Object.freeze(this.scoringDecisionIds);
    Object.freeze(this);
  }

  static create(props: {
    id?: string;
    caseId: string;
    type: IrregularShotEntryType;
    statement: string;
    officialName: string;
    ruleReference?: string;
    resolutionCode?: IrregularShotResolutionCode;
    incidentReportId?: string;
    scoringDecisionIds?: readonly string[];
    occurredAt?: Date;
    recordedAt?: Date;
  }): IrregularShotCaseEntry {
    if (!IRREGULAR_SHOT_ENTRY_TYPES.includes(props.type)) throw new Error('Irregular shot entry type is invalid');
    const resolution = props.type === 'RESOLVED';
    if (resolution !== Boolean(props.resolutionCode && props.incidentReportId)) {
      throw new Error('A resolution requires a resolution code and Range Incident Report');
    }
    const decisionIds = [
      ...new Set((props.scoringDecisionIds ?? []).map((value) => requiredText(value, 'decisionId'))),
    ];
    if (!resolution && decisionIds.length > 0) throw new Error('Only a resolution may link scoring decisions');
    if (resolution && props.resolutionCode !== 'NO_SCORE_CHANGE' && decisionIds.length === 0) {
      throw new Error('A score-affecting resolution requires at least one scoring decision');
    }
    return new IrregularShotCaseEntry(
      props.id ?? crypto.randomUUID(),
      requiredText(props.caseId, 'caseId'),
      props.type,
      requiredText(props.statement, 'statement'),
      requiredText(props.officialName, 'officialName'),
      optionalText(props.ruleReference),
      props.resolutionCode ?? null,
      optionalText(props.incidentReportId),
      decisionIds,
      validDate(props.occurredAt ?? new Date(), 'occurredAt'),
      validDate(props.recordedAt ?? new Date(), 'recordedAt'),
    );
  }

  static reconstruct(props: Parameters<typeof IrregularShotCaseEntry.create>[0] & { id: string; recordedAt: Date }) {
    return IrregularShotCaseEntry.create(props);
  }
}

export function irregularShotCaseStatus(entries: readonly IrregularShotCaseEntry[]): IrregularShotCaseStatus {
  let status: IrregularShotCaseStatus = 'OPEN';
  for (const entry of entries) {
    if (entry.type === 'REFERRED') status = 'REFERRED';
    else if (entry.type === 'RESOLVED') status = 'RESOLVED';
    else if (entry.type === 'REOPENED') status = 'OPEN';
    else if (entry.type === 'CLOSED') status = 'CLOSED';
    else if (entry.type === 'VOID') status = 'VOID';
  }
  return status;
}

function requiredText(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}

function optionalText(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function validDate(value: Date, name: string): Date {
  if (!Number.isFinite(value.getTime())) throw new Error(`${name} must be valid`);
  return new Date(value.getTime());
}
