// SPDX-License-Identifier: MIT

export interface QualificationRecoverySettlementShotEvidence {
  readonly shotId: string;
  readonly shotNumber: number;
  readonly seriesNumber: number;
  readonly scoreX10: number;
  readonly calculatedScoreX10: number;
  readonly deviceScoreX10: number | null;
  readonly innerTen: boolean;
  readonly x: number | null;
  readonly y: number | null;
  readonly firedAt: string;
  readonly receivedAt: string;
  readonly observationId: string | null;
  readonly targetProfileId: string | null;
  readonly scoringGaugeProfileId: string | null;
}

export interface QualificationRecoverySettlementRecord {
  readonly id: string;
  readonly decisionId: string;
  readonly competitionId: string;
  readonly sessionId: string;
  readonly interruptionId: string;
  readonly treatment: 'KEEP_RECORDED_SERIES';
  readonly stageIndex: number;
  readonly seriesIndex: number;
  readonly sessionSeriesNumber: number;
  readonly expectedMatchProgramId: string;
  readonly expectedSeriesShotLimit: number;
  readonly expectedRecordedShots: number;
  readonly decisionOfficialName: string;
  readonly decisionRuleReference: string;
  readonly decidedAt: Date;
  readonly appliedBy: string;
  readonly statement: string;
  readonly appliedAt: Date;
  readonly recordedShots: readonly QualificationRecoverySettlementShotEvidence[];
}

export type QualificationRecoverySettlementRequest = Omit<
  QualificationRecoverySettlementRecord,
  'id' | 'sessionId' | 'sessionSeriesNumber' | 'recordedShots'
>;

/** Immutable evidence that a full recorded series was retained without recovery firing. */
export function createQualificationRecoverySettlement(
  input: QualificationRecoverySettlementRecord,
): QualificationRecoverySettlementRecord {
  if (input.treatment !== 'KEEP_RECORDED_SERIES') {
    throw new Error('A no-fire settlement only supports KEEP_RECORDED_SERIES');
  }
  const expectedSeriesShotLimit = positiveInteger(input.expectedSeriesShotLimit, 'expectedSeriesShotLimit');
  const expectedRecordedShots = nonNegativeInteger(input.expectedRecordedShots, 'expectedRecordedShots');
  if (expectedRecordedShots !== expectedSeriesShotLimit) {
    throw new Error('KEEP_RECORDED_SERIES requires a full recorded series');
  }
  const sessionSeriesNumber = positiveInteger(input.sessionSeriesNumber, 'sessionSeriesNumber');
  const recordedShots = input.recordedShots.map((shot) => validateShotEvidence(shot));
  if (recordedShots.length !== expectedRecordedShots) {
    throw new Error('Settlement evidence must contain every recorded series shot');
  }
  if (new Set(recordedShots.map((shot) => shot.shotId)).size !== recordedShots.length) {
    throw new Error('Settlement shot IDs must be unique');
  }
  if (recordedShots.some((shot) => shot.seriesNumber !== sessionSeriesNumber)) {
    throw new Error('Settlement evidence must belong to the settled session series');
  }

  return deepFreeze({
    id: requiredText(input.id, 'id'),
    decisionId: requiredText(input.decisionId, 'decisionId'),
    competitionId: requiredText(input.competitionId, 'competitionId'),
    sessionId: requiredText(input.sessionId, 'sessionId'),
    interruptionId: requiredText(input.interruptionId, 'interruptionId'),
    treatment: input.treatment,
    stageIndex: nonNegativeInteger(input.stageIndex, 'stageIndex'),
    seriesIndex: nonNegativeInteger(input.seriesIndex, 'seriesIndex'),
    sessionSeriesNumber,
    expectedMatchProgramId: requiredText(input.expectedMatchProgramId, 'expectedMatchProgramId'),
    expectedSeriesShotLimit,
    expectedRecordedShots,
    decisionOfficialName: requiredText(input.decisionOfficialName, 'decisionOfficialName'),
    decisionRuleReference: requiredText(input.decisionRuleReference, 'decisionRuleReference'),
    decidedAt: validDate(input.decidedAt, 'decidedAt'),
    appliedBy: requiredText(input.appliedBy, 'appliedBy'),
    statement: requiredText(input.statement, 'statement'),
    appliedAt: validDate(input.appliedAt, 'appliedAt'),
    recordedShots,
  });
}

export function qualificationRecoverySettlementRequestMatches(
  record: QualificationRecoverySettlementRecord,
  request: QualificationRecoverySettlementRequest,
): boolean {
  return (
    record.decisionId === request.decisionId.trim() &&
    record.competitionId === request.competitionId.trim() &&
    record.interruptionId === request.interruptionId.trim() &&
    record.treatment === request.treatment &&
    record.stageIndex === request.stageIndex &&
    record.seriesIndex === request.seriesIndex &&
    record.expectedMatchProgramId === request.expectedMatchProgramId.trim() &&
    record.expectedSeriesShotLimit === request.expectedSeriesShotLimit &&
    record.expectedRecordedShots === request.expectedRecordedShots &&
    record.decisionOfficialName === request.decisionOfficialName.trim() &&
    record.decisionRuleReference === request.decisionRuleReference.trim() &&
    record.decidedAt.getTime() === request.decidedAt.getTime() &&
    record.appliedBy === request.appliedBy.trim() &&
    record.statement === request.statement.trim() &&
    record.appliedAt.getTime() === request.appliedAt.getTime()
  );
}

function validateShotEvidence(
  input: QualificationRecoverySettlementShotEvidence,
): QualificationRecoverySettlementShotEvidence {
  if ((input.x === null) !== (input.y === null)) throw new Error('Settlement shot coordinates must be paired');
  if (!Number.isFinite(input.scoreX10) || !Number.isFinite(input.calculatedScoreX10)) {
    throw new Error('Settlement shot scores must be finite');
  }
  if (input.deviceScoreX10 !== null && !Number.isFinite(input.deviceScoreX10)) {
    throw new Error('Settlement device score must be finite');
  }
  if (input.x !== null && (!Number.isFinite(input.x) || !Number.isFinite(input.y))) {
    throw new Error('Settlement shot coordinates must be finite');
  }
  return Object.freeze({
    ...input,
    shotId: requiredText(input.shotId, 'shotId'),
    shotNumber: positiveInteger(input.shotNumber, 'shotNumber'),
    seriesNumber: positiveInteger(input.seriesNumber, 'seriesNumber'),
    firedAt: validIsoDate(input.firedAt, 'firedAt'),
    receivedAt: validIsoDate(input.receivedAt, 'receivedAt'),
    observationId: optionalText(input.observationId),
    targetProfileId: optionalText(input.targetProfileId),
    scoringGaugeProfileId: optionalText(input.scoringGaugeProfileId),
  });
}

function requiredText(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}

function optionalText(value: string | null): string | null {
  if (value === null) return null;
  return value.trim() || null;
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

function nonNegativeInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`);
  return value;
}

function validDate(value: Date, name: string): Date {
  if (!Number.isFinite(value.getTime())) throw new Error(`${name} must be a valid date`);
  return new Date(value.getTime());
}

function validIsoDate(value: string, name: string): string {
  if (!Number.isFinite(Date.parse(value))) throw new Error(`${name} must be an ISO date`);
  return new Date(value).toISOString();
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}
